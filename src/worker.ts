import { ethers } from "ethers";
import mongoose from "mongoose";
import { WebSocket } from "ws";
import { Directory } from "./loaders/Directory";
import { subscribeToUserBalancesLoading } from "./subscriptions";
import { rootLogger } from "./util";

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
}

export class ChainWorker {
  readonly index: number;
  readonly rpc: string;
  readonly directoryAddress: string;
  chainId: number | undefined;
  name: string | undefined;

  provider: ethers.providers.WebSocketProvider | undefined;
  worker: Promise<void> | undefined;

  directory: Directory | undefined;

  providerStatus: ProviderStatus = ProviderStatus.STARTING;
  wsStatus: string = "STARTING";
  wsWatch: NodeJS.Timer | undefined;
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
    };
  }

  private createProvider() {
    this.provider = new ethers.providers.WebSocketProvider(this.rpc);
    this.wsStatus = WsStatus[this.provider!.websocket.readyState];

    const originalHandler = this.provider.websocket.onerror;
    this.provider.websocket.onerror = (event) => {
      log.error({
        msg: `Websocket failure : ${event.message}`,
        event,
      });
      this.providerStatus = ProviderStatus.DISCONNECTED;
      this.wsStatus = WsStatus[WebSocket.CLOSED];

      if (originalHandler) originalHandler(event);

      this.stop();
    };

    this.provider.ready
      .then((network) => {
        log.info({ msg: "Connected to network", network });

        this.chainId = network.chainId;
        this.name = network.name;
        this.providerStatus = ProviderStatus.CONNECTED;

        return network;
      })
      .catch((err) => {
        log.error({
          msg: `Error connecting to network ${this.rpc}`,
          err,
        });
        this.providerStatus = ProviderStatus.DISCONNECTED;
        this.wsStatus = WsStatus[this.provider!.websocket.readyState];
        this.stop();
      });

    this.wsWatch = setInterval(() => {
      this.wsStatus = WsStatus[this.provider!.websocket.readyState];

      if (
        this.providerStatus !== ProviderStatus.DISCONNECTED &&
        ([WebSocket.CLOSING, WebSocket.CLOSED] as number[]).includes(
          this.provider!.websocket.readyState
        )
      ) {
        log.info(`Websocket crashed : ${this.name} ${this.chainId}`);
        this.providerStatus = ProviderStatus.DISCONNECTED;
        this.stop();
      }

      if (
        this.providerStatus !== ProviderStatus.CONNECTING &&
        this.provider!.websocket.readyState === WebSocket.CONNECTING
      ) {
        log.info(`Websocket connecting : ${this.name} ${this.chainId}`);
        this.providerStatus = ProviderStatus.CONNECTING;
      }

      if (
        this.providerStatus !== ProviderStatus.CONNECTED &&
        this.provider!.websocket.readyState === WebSocket.OPEN
      ) {
        log.info(`Websocket connected : ${this.name} ${this.chainId}`);
        this.providerStatus = ProviderStatus.CONNECTED;
      }
    }, 1000);
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
        msg: `Error connecting to rpc ${this.rpc}`,
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
      await mongoose.startSession().then(async (session) => {
        session.withTransaction(
          async () => await this.directory!.init(session)
        );
        await session.endSession();
      });
      log.info(
        `Initialization complete for ${this.name} ${this.chainId}subscribing to updates`
      );
      this.directory.subscribeToEvents();
      await subscribeToUserBalancesLoading(this.directory);
    } catch (err) {
      log.error({
        msg: `Error happened killing worker on network ${this.name} chainId=${this.chainId}`,
        err,
      });
    }
    log.info(`Worker stopped on chain ${this.name} ${this.chainId}`);
  }

  private async stop() {
    this.provider?.removeAllListeners();
    this.worker = undefined;
    await this.provider?.destroy();
    this.provider = undefined;
    if (this.wsWatch !== undefined) {
      clearInterval(this.wsWatch);
      this.wsWatch = undefined;
    }
    this.providerStatus = ProviderStatus.DEAD;
    this.workerStatus = WorkerStatus.DEAD;
  }
}
