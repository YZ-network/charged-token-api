import { Logger } from "pino";
import { WebSocket } from "ws";
import { AutoWebSocketProvider } from "./blockchain/AutoWebSocketProvider";
import { BlockchainRepository } from "./blockchain/BlockchainRepository";
import { Config } from "./config";
import { AbstractBroker } from "./core/AbstractBroker";
import { AbstractDbRepository } from "./core/AbstractDbRepository";
import { ContractsRegistry } from "./core/ContractsRegistry";
import { Metrics } from "./metrics";
import { rootLogger } from "./rootLogger";
import { subscribeToUserBalancesLoading } from "./subscriptions/subscribeToUserBalances";

const WsStatus = ["CONNECTING", "OPEN", "CLOSING", "CLOSED"];

export class ChainWorker {
  private readonly log: Logger;
  readonly index: number;
  readonly rpc: string;
  readonly directoryAddress: string;
  readonly chainId: number;
  readonly db: AbstractDbRepository;
  readonly broker: AbstractBroker;

  contractsRegistry: ContractsRegistry | undefined;
  blockchain: BlockchainRepository | undefined;
  name: string | undefined;
  restartCount: number = 0;

  providerIndex: number = 0;
  provider: AutoWebSocketProvider | undefined;
  worker: Promise<void> | undefined;

  providerStatus: ProviderStatus = "STARTING";
  wsStatus: string = "STARTING";
  wsWatch: NodeJS.Timeout | undefined;
  workerStatus: WorkerStatus = "WAITING";

  disconnectedTimestamp: number = new Date().getTime();
  cumulatedNodeDowntime: number = 0;

  constructor(
    index: number,
    rpc: string,
    directoryAddress: string,
    chainId: number,
    dbRepository: AbstractDbRepository,
    broker: AbstractBroker,
  ) {
    this.log = rootLogger.child({ chainId, name: "Worker" });

    this.index = index;
    this.rpc = rpc;
    this.directoryAddress = directoryAddress;
    this.chainId = chainId;
    this.db = dbRepository;
    this.broker = broker;
  }

  get blockNumberBeforeDisconnect(): number {
    return this.blockchain!.blockNumberBeforeDisconnect;
  }

  async start() {
    try {
      this.createProvider();
      this.createWorker();
    } catch (err) {
      this.log.error({
        msg: "Error connecting to network !",
        providerIndex: this.providerIndex,
        err,
      });
      await this.stop();
    }
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

  private logDisconnectedStateIfNeeded() {
    const now = new Date().getTime();

    if (this.disconnectedTimestamp < 0) {
      this.disconnectedTimestamp = now;
    }

    const deltaMs = now - this.disconnectedTimestamp;

    if (deltaMs >= Config.delays.nodeDownAlertDelayMs) {
      const firstAlert = this.cumulatedNodeDowntime === 0;

      this.cumulatedNodeDowntime += deltaMs;
      this.disconnectedTimestamp = now;

      if (firstAlert) {
        this.log.error({
          msg: "Blockchain provider is down !",
          providerIndex: this.providerIndex,
        });
      }
    }
  }

  private logDowntimeAfterReconnection() {
    if (this.disconnectedTimestamp < 0 && this.cumulatedNodeDowntime === 0) {
      return;
    }

    const deltaMs = new Date().getTime() - this.disconnectedTimestamp;
    this.cumulatedNodeDowntime += deltaMs;

    if (this.cumulatedNodeDowntime >= 60000) {
      this.log.warn({
        msg: "Blockchain provider was down for more than a minute !",
        providerIndex: this.providerIndex,
        downtimeSeconds: Math.round(this.cumulatedNodeDowntime / 1000),
      });
    } else {
      this.log.debug({
        msg: "Blockchain provider was down !",
        providerIndex: this.providerIndex,
        downtimeSeconds: Math.round(this.cumulatedNodeDowntime / 1000),
      });
    }

    this.disconnectedTimestamp = -1;
    this.cumulatedNodeDowntime = 0;
  }

  private createProvider() {
    this.providerIndex++;

    this.log.info({ msg: "Creating provider", providerIndex: this.providerIndex });

    this.provider = new AutoWebSocketProvider(this.rpc, {
      chainId: this.chainId,
      maxParallelRequests: Config.delays.rpcMaxParallelRequests,
      maxRetryCount: Config.delays.rpcMaxRetryCount,
      pingDelayMs: Config.delays.rpcPingDelayMs,
      pongMaxWaitMs: Config.delays.rpcPongMaxWaitMs,
      retryDelayMs: Config.delays.rpcRetryDelayMs,
      providerIndex: this.providerIndex,
    });

    this.wsStatus = WsStatus[this.provider.websocket.readyState];

    this.provider.on("error", (...args) => {
      if (args[0] === "WebSocket closed") {
        if (this.wsStatus === WsStatus[0]) {
          Metrics.connectionFailed(this.chainId);
        }
        this.log.warn({
          msg: "Websocket connection lost",
          rpc: this.rpc,
          args,
          providerIndex: this.providerIndex,
        });
        this.logStopResult(this.stop());

        this.logDisconnectedStateIfNeeded();
      } else if (typeof args[0] === "string") {
        this.log.error({
          msg: "Websocket unknown error",
          rpc: this.rpc,
          args,
          providerIndex: this.providerIndex,
        });
      }
    });
    this.provider.on("debug", (...args) => {
      this.log.debug({ ...args, providerIndex: this.providerIndex });
    });

    this.provider.ready
      .then((network) => {
        this.logDowntimeAfterReconnection();

        this.log.info({
          msg: "Connected to network",
          network,
          providerIndex: this.providerIndex,
        });

        if (this.chainId !== network.chainId) {
          throw new Error(`RPC Node returned wrong chain ${JSON.stringify(network)}, expected chainId ${this.chainId}`);
        }

        this.name = network.name;
        this.providerStatus = "CONNECTED";

        return network;
      })
      .catch((err) => {
        this.log.error({
          msg: "Error connecting to network",
          rpc: this.rpc,
          err,
          providerIndex: this.providerIndex,
        });
        this.wsStatus = WsStatus[WebSocket.CLOSED];
        Metrics.connectionFailed(this.chainId);
        this.logStopResult(this.stop());

        this.logDisconnectedStateIfNeeded();
      });

    this.log.info({
      msg: "Starting websocket watch",
      providerIndex: this.providerIndex,
    });

    let prevWsStatus = this.wsStatus;
    this.wsWatch = setInterval(() => {
      if (this.provider?.websocket === undefined) {
        return;
      }

      this.wsStatus = WsStatus[this.provider.websocket.readyState];

      if (this.wsStatus !== prevWsStatus) {
        const memoizedPrevWsStatus = prevWsStatus;

        prevWsStatus = this.wsStatus;

        if (["CLOSING", "CLOSED"].includes(this.wsStatus)) {
          this.log.warn({
            msg: "Websocket crashed",
            network: this.name,
            wsStatus: this.wsStatus,
            prevWsStatus: memoizedPrevWsStatus,
            readyState: this.provider.websocket.readyState,
            providerIndex: this.providerIndex,
          });
          this.logStopResult(this.stop());
        } else if (this.providerStatus !== "CONNECTING" && this.wsStatus === "CONNECTING") {
          this.log.info({
            msg: "Websocket connecting",
            network: this.name,
            wsStatus: this.wsStatus,
            prevWsStatus: memoizedPrevWsStatus,
            readyState: this.provider.websocket.readyState,
            providerIndex: this.providerIndex,
          });
        } else if (this.providerStatus !== "CONNECTED" && this.wsStatus === "OPEN") {
          this.log.info({
            msg: "Websocket connected",
            network: this.name,
            wsStatus: this.wsStatus,
            prevWsStatus: memoizedPrevWsStatus,
            readyState: this.provider.websocket.readyState,
            providerIndex: this.providerIndex,
          });
        } else {
          this.log.warn({
            msg: "Unknown websocket state !",
            network: this.name,
            providerStatus: this.providerStatus,
            wsStatus: this.wsStatus,
            prevWsStatus: memoizedPrevWsStatus,
            readyState: this.provider.websocket.readyState,
            providerIndex: this.providerIndex,
          });
        }
      }
    }, 50);
  }

  private logStopResult(promise: Promise<void>) {
    promise
      .then(() => {
        this.log.info({
          msg: "Worker stopped after websocket crashed",
          network: this.name,
          stack: new Error().stack,
          providerIndex: this.providerIndex,
        });
      })
      .catch((err) => {
        this.log.info({
          msg: "Error stopping worker after websocket crashed",
          network: this.name,
          err,
          providerIndex: this.providerIndex,
        });
      });
  }

  private createWorker() {
    if (this.provider === undefined) {
      throw new Error("No provider to create worker !");
    }

    this.worker = this.provider.ready
      .then(async () => {
        await this.run()
          .then(() => {
            this.log.info({
              msg: "Worker stopped itself",
              network: this.name,
              providerIndex: this.providerIndex,
            });
            this.logStopResult(this.stop());
          })
          .catch((err: any) => {
            this.log.error({
              msg: "Worker crashed",
              rpc: this.rpc,
              network: this.name,
              err,
              providerIndex: this.providerIndex,
            });
            this.logStopResult(this.stop());
          });
      })
      .catch(() => {});
  }

  private async run() {
    if (this.provider === undefined) {
      throw new Error("No provider to run worker !");
    }

    this.log.info({
      msg: "Starting worker",
      network: this.name,
      providerIndex: this.providerIndex,
    });

    try {
      this.blockchain = new BlockchainRepository(this.chainId, this.provider, this.db, this.broker);
      this.contractsRegistry = new ContractsRegistry(this.chainId, this.blockchain);

      await this.contractsRegistry.registerDirectory(this.directoryAddress);

      this.workerStatus = "STARTED";
      Metrics.workerStarted(this.chainId);

      await subscribeToUserBalancesLoading(this.chainId, this.db, this.blockchain, this.broker);
    } catch (err) {
      this.log.error({
        msg: "Error happened running worker",
        network: this.name,
        err,
        providerIndex: this.providerIndex,
      });
    }
    this.log.info({
      msg: "Worker stopped",
      network: this.name,
      providerIndex: this.providerIndex,
    });
  }

  private async stop() {
    if (this.providerStatus === "DISCONNECTED" && this.workerStatus === "DEAD") return;

    this.log.debug({
      msg: "Stopping worker",
      network: this.name,
      stack: new Error().stack,
      providerIndex: this.providerIndex,
    });

    this.providerStatus = "DISCONNECTED";
    this.workerStatus = "DEAD";

    Metrics.workerStopped(this.chainId);

    await this.contractsRegistry?.unregisterDirectory(this.directoryAddress);

    this.blockchain?.destroy();
    this.blockchain = undefined;

    this.provider?.removeAllListeners();
    this.worker = undefined;

    this.log.info({ msg: "Destroying provider", providerIndex: this.providerIndex });
    await this.provider?.destroy();
    this.provider = undefined;

    if (this.wsWatch !== undefined) {
      this.log.info({ msg: "Stopping websocket watch", providerIndex: this.providerIndex });

      clearInterval(this.wsWatch);
      this.wsWatch = undefined;
    }

    await this.db.deletePendingAndFailedEvents(this.chainId);

    this.restartCount++;
  }
}
