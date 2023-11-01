import mongoose from "mongoose";
import { WebSocket } from "ws";
import { Config } from "./config";
import { EventHandlerStatus, ProviderStatus, WorkerStatus } from "./enums";
import { Directory } from "./loaders/Directory";
import { EventListener } from "./loaders/EventListener";
import { EventModel } from "./models";
import { subscribeToUserBalancesLoading } from "./subscriptions";
import { Metrics, rootLogger } from "./util";
import { AutoWebSocketProvider } from "./util/AutoWebSocketProvider";

const log = rootLogger.child({ name: "worker" });

const WsStatus = ["CONNECTING", "OPEN", "CLOSING", "CLOSED"];

export interface ChainHealth {
  index: number;
  rpc: string;
  directory: string;
  name?: string;
  chainId?: number;
  providerStatus: ProviderStatus;
  workerStatus: WorkerStatus;
  wsStatus: string;
  restartCount: number;
}

export class ChainWorker {
  readonly index: number;
  readonly rpc: string;
  readonly directoryAddress: string;
  readonly chainId: number;

  eventListener: EventListener | undefined;
  name: string | undefined;
  restartCount: number = 0;
  blockNumberBeforeDisconnect: number = 0;

  provider: AutoWebSocketProvider | undefined;
  worker: Promise<void> | undefined;

  directory: Directory | undefined;

  providerStatus: ProviderStatus = ProviderStatus.STARTING;
  wsStatus: string = "STARTING";
  wsWatch: NodeJS.Timeout | undefined;
  pingInterval: NodeJS.Timeout | undefined;
  pongTimeout: NodeJS.Timeout | undefined;
  workerStatus: WorkerStatus = WorkerStatus.WAITING;

  constructor(index: number, rpc: string, directoryAddress: string, chainId: number) {
    this.index = index;
    this.rpc = rpc;
    this.directoryAddress = directoryAddress;
    this.chainId = chainId;

    this.start();
  }

  start() {
    this.createProvider();
    this.createWorker();
  }

  status(): ChainHealth {
    return {
      index: this.index,
      rpc: this.rpc,
      directory: this.directoryAddress,
      name: this.name,
      chainId: this.chainId,
      providerStatus: this.providerStatus,
      workerStatus: this.workerStatus,
      wsStatus: this.wsStatus,
      restartCount: this.restartCount,
    };
  }

  private createProvider() {
    this.provider = new AutoWebSocketProvider(this.rpc, {
      chainId: this.chainId,
      maxParallelRequests: Config.delays.rpcMaxParallelRequests,
      maxRetryCount: Config.delays.rpcMaxRetryCount,
      pingDelayMs: Config.delays.rpcPingDelayMs,
      pongMaxWaitMs: Config.delays.rpcPongMaxWaitMs,
      retryDelayMs: Config.delays.rpcRetryDelayMs,
    });

    this.wsStatus = WsStatus[this.provider.websocket.readyState];

    this.provider.on("error", (...args) => {
      if (this.wsStatus === WsStatus[0]) {
        Metrics.connectionFailed(this.chainId);
      }
      log.warn({
        msg: `Websocket connection lost to rpc ${this.rpc}`,
        args,
        chainId: this.chainId,
      });
      this.providerStatus = ProviderStatus.DISCONNECTED;
      this.stop();
    });
    this.provider.on("debug", (...args) => {
      log.debug({ args, chainId: this.chainId });
    });

    this.provider.ready
      .then((network) => {
        log.info({
          msg: "Connected to network",
          network,
          chainId: this.chainId,
        });

        if (this.chainId !== network.chainId) {
          throw new Error(`RPC Node returned wrong chain ${JSON.stringify(network)}, expected chainId ${this.chainId}`);
        }

        this.name = network.name;
        this.providerStatus = ProviderStatus.CONNECTED;

        return network;
      })
      .catch((err) => {
        log.error({
          msg: `Error connecting to network ${this.rpc}`,
          err,
          chainId: this.chainId,
        });
        this.providerStatus = ProviderStatus.DISCONNECTED;
        this.wsStatus = WsStatus[WebSocket.CLOSED];
        Metrics.connectionFailed(this.chainId);
        this.stop();
      });

    let prevWsStatus = this.wsStatus;
    this.wsWatch = setInterval(() => {
      if (this.provider?.websocket === undefined) return;

      this.wsStatus = WsStatus[this.provider.websocket.readyState];

      if (this.wsStatus !== prevWsStatus) {
        prevWsStatus = this.wsStatus;

        if (this.providerStatus !== ProviderStatus.DISCONNECTED && ["CLOSING", "CLOSED"].includes(this.wsStatus)) {
          log.warn({
            msg: `Websocket crashed : ${this.name}`,
            chainId: this.chainId,
          });
        }

        if (this.providerStatus !== ProviderStatus.CONNECTING && this.wsStatus === "CONNECTING") {
          log.info({
            msg: `Websocket connecting : ${this.name}`,
            chainId: this.chainId,
          });
        }

        if (this.providerStatus !== ProviderStatus.CONNECTED && this.wsStatus === "OPEN") {
          log.info({
            msg: `Websocket connected : ${this.name}`,
            chainId: this.chainId,
          });
        }
      }
    }, 50);
  }

  private subscribeToNewBlocks() {
    if (this.provider === undefined) {
      throw new Error("No provider to subscribe for new blocks !");
    }

    this.provider.on("block", (blockNumber: number) => {
      if (this.blockNumberBeforeDisconnect < blockNumber) {
        this.blockNumberBeforeDisconnect = blockNumber;
      }
    });
  }

  private createWorker() {
    if (this.provider === undefined) {
      throw new Error("No provider to create worker !");
    }

    this.worker = this.provider.ready
      .then(async () => {
        this.workerStatus = WorkerStatus.STARTED;

        Metrics.workerStarted(this.chainId);

        await this.run()
          .then(() => {
            log.info({
              msg: `Worker stopped itself on network ${this.name}`,
              chainId: this.chainId,
            });
            this.workerStatus = WorkerStatus.CRASHED;
            this.stop();
          })
          .catch((err: any) => {
            log.error({
              msg: `Worker crashed on : ${this.rpc}, ${this.name}`,
              err,
              chainId: this.chainId,
            });
            this.workerStatus = WorkerStatus.CRASHED;
            this.stop();
          });
      })
      .catch(() => {});
  }

  private async run() {
    if (this.provider === undefined) {
      throw new Error("No provider to run worker !");
    }

    log.info({
      msg: `Starting worker on chain ${this.name}`,
      chainId: this.chainId,
    });

    try {
      this.eventListener = new EventListener();
      this.directory = new Directory(this.eventListener, this.chainId, this.provider, this.directoryAddress);
      const blockNumber = await this.provider.getBlockNumber();

      log.info({
        msg: "Initializing directory",
        chainId: this.chainId,
        blockNumber,
        blockNumberBeforeDisconnect: this.blockNumberBeforeDisconnect,
      });

      const session = await mongoose.startSession();

      await this.directory.init(session, blockNumber, true);
      await session.endSession();
      log.info({
        msg: `Initialization complete for ${this.name} subscribing to updates`,
        chainId: this.chainId,
      });
      this.directory.subscribeToEvents();
      this.subscribeToNewBlocks();
      await subscribeToUserBalancesLoading(this.directory);
    } catch (err) {
      log.error({
        msg: `Error happened running worker on network ${this.name}`,
        err,
        chainId: this.chainId,
      });
    }
    log.info({
      msg: `Worker stopped on chain ${this.name}`,
      chainId: this.chainId,
    });
  }

  private async stop() {
    if (this.providerStatus === ProviderStatus.DEAD && this.workerStatus === WorkerStatus.DEAD) return;

    Metrics.workerStopped(this.chainId);

    this.eventListener?.destroy();
    this.eventListener = undefined;

    this.directory?.destroy();
    this.directory = undefined;
    this.provider?.removeAllListeners();
    this.worker = undefined;

    await this.provider?.destroy();
    this.provider = undefined;

    if (this.wsWatch !== undefined) {
      clearInterval(this.wsWatch);
      this.wsWatch = undefined;
    }

    if (this.pingInterval !== undefined) {
      clearInterval(this.pingInterval);
      this.pingInterval = undefined;
    }

    if (this.pongTimeout !== undefined) {
      clearTimeout(this.pongTimeout);
      this.pongTimeout = undefined;
    }

    const pendingEvents = await EventModel.find({
      chainId: this.chainId,
      status: EventHandlerStatus.QUEUED,
    });
    const failedEvents = await EventModel.find({
      chainId: this.chainId,
      status: EventHandlerStatus.FAILURE,
    });
    if (pendingEvents.length > 0) {
      log.warn({
        msg: `Found ${pendingEvents.length} pending events ! will remove them`,
        chainId: this.chainId,
      });
    }
    if (failedEvents.length > 0) {
      log.warn({
        msg: `Found ${failedEvents.length} failed events ! will remove them`,
        events: failedEvents.map((event) => event.toJSON()),
        chainId: this.chainId,
      });
    }
    await EventModel.deleteMany({
      chainId: this.chainId,
      status: { $in: [EventHandlerStatus.QUEUED, EventHandlerStatus.FAILURE] },
    });

    this.providerStatus = ProviderStatus.DEAD;
    this.workerStatus = WorkerStatus.DEAD;
    this.restartCount++;
  }
}
