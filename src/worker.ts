import mongoose from "mongoose";
import { WebSocket } from "ws";
import { Directory } from "./loaders/Directory";
import { EventHandlerStatus, EventModel } from "./models/Event";
import { subscribeToUserBalancesLoading } from "./subscriptions";
import { AutoWebSocketProvider, rootLogger } from "./util";

const log = rootLogger.child({ name: "worker" });

export enum ProviderStatus {
  STARTING = "STARTING",
  CONNECTING = "CONNECTING",
  CONNECTED = "CONNECTED",
  DISCONNECTED = "DISCONNECTED",
  DEAD = "DEAD",
}

export enum WorkerStatus {
  WAITING = "WAITING",
  STARTED = "STARTED",
  CRASHED = "CRASHED",
  DEAD = "DEAD",
}

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
  chainId: number | undefined;
  name: string | undefined;
  restartCount: number = 0;
  blockNumberBeforeDisconnect: number = 0;

  provider: AutoWebSocketProvider | undefined;
  worker: Promise<void> | undefined;

  directory: Directory | undefined;

  providerStatus: ProviderStatus = ProviderStatus.STARTING;
  wsStatus: string = "STARTING";
  wsWatch: NodeJS.Timer | undefined;
  pingInterval: NodeJS.Timer | undefined;
  pongTimeout: NodeJS.Timeout | undefined;
  workerStatus: WorkerStatus = WorkerStatus.WAITING;

  constructor(index: number, rpc: string, directoryAddress: string) {
    this.index = index;
    this.rpc = rpc;
    this.directoryAddress = directoryAddress;

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
    this.provider = new AutoWebSocketProvider(this.rpc);
    this.wsStatus = WsStatus[this.provider!.websocket.readyState];

    this.provider.on("error", (...args) => {
      log.warn({
        msg: `Websocket connection lost to rpc ${this.rpc}`,
        args,
      });
      this.providerStatus = ProviderStatus.DISCONNECTED;
      this.stop();
    });
    this.provider.on("debug", (...args) => {
      log.debug({ args });
    });

    this.provider.ready
      .then((network) => {
        log.info({ msg: "Connected to network", network });

        this.chainId = network.chainId;
        this.name = network.name;
        this.providerStatus = ProviderStatus.CONNECTED;

        this.subscribeToNewBlocks();

        return network;
      })
      .catch((err) => {
        log.error({
          msg: `Error connecting to network ${this.rpc}`,
          err,
        });
        this.providerStatus = ProviderStatus.DISCONNECTED;
        this.wsStatus = WsStatus[WebSocket.CLOSED];
        this.stop();
      });

    this.wsWatch = setInterval(() => {
      if (!this.provider || !this.provider.websocket) return;

      this.wsStatus = WsStatus[this.provider!.websocket.readyState];

      if (
        this.providerStatus !== ProviderStatus.DISCONNECTED &&
        ["CLOSING", "CLOSED"].includes(this.wsStatus)
      ) {
        log.warn(`Websocket crashed : ${this.name} ${this.chainId}`);
      }

      if (
        this.providerStatus !== ProviderStatus.CONNECTING &&
        this.wsStatus === "CONNECTING"
      ) {
        log.info(`Websocket connecting : ${this.name} ${this.chainId}`);
      }

      if (
        this.providerStatus !== ProviderStatus.CONNECTED &&
        this.wsStatus === "OPEN"
      ) {
        log.info(`Websocket connected : ${this.name} ${this.chainId}`);
      }
    }, 1000);
  }

  private subscribeToNewBlocks() {
    this.provider!.on("block", (blockNumber: number) => {
      if (this.blockNumberBeforeDisconnect < blockNumber) {
        this.blockNumberBeforeDisconnect = blockNumber;
      }
    });
  }

  private createWorker() {
    this.worker = this.provider!.ready.then(() => {
      this.workerStatus = WorkerStatus.STARTED;

      return this.run()
        .then(() => {
          log.info(
            `Worker stopped itself on network ${this.name} ${this.chainId}`
          );
          this.workerStatus = WorkerStatus.CRASHED;
          this.stop();
        })
        .catch((err: any) => {
          log.error({
            msg: `Worker crashed on : ${this.rpc}, ${this.name} ${this.chainId}`,
            err,
          });
          this.workerStatus = WorkerStatus.CRASHED;
          this.stop();
        });
    }).catch((err) => {
      log.error({
        msg: `Websocket crashed on ${this.rpc}`,
        err,
      });
      this.providerStatus = ProviderStatus.DISCONNECTED;
      this.stop();
    });
  }

  private async run() {
    log.info(`Starting worker on chain ${this.name} chainId=${this.chainId}`);

    try {
      this.directory = new Directory(
        this.chainId!,
        this.provider!,
        this.directoryAddress
      );
      const session = await mongoose.startSession();
      await session.withTransaction(
        async () =>
          await this.directory!.init(session, this.blockNumberBeforeDisconnect)
      );
      await session.endSession();
      log.info(
        `Initialization complete for ${this.name} ${this.chainId}subscribing to updates`
      );
      this.directory.subscribeToEvents();
      await subscribeToUserBalancesLoading(this.directory);
    } catch (err) {
      log.error({
        msg: `Error happened running worker on network ${this.name} chainId=${this.chainId}`,
        err,
      });
    }
    log.info(`Worker stopped on chain ${this.name} ${this.chainId}`);
  }

  private async stop() {
    this.directory?.destroy();
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
      log.warn(
        `Found ${pendingEvents.length} pending events ! maybe remove them`
      );
    }
    if (failedEvents.length > 0) {
      log.warn({
        msg: `Found ${failedEvents.length} failed events ! maybe remove them`,
        events: failedEvents.map((event) => event.toJSON()),
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
