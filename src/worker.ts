import { WebSocket } from "ws";
import { AutoWebSocketProvider } from "./blockchain/AutoWebSocketProvider";
import { BlockchainRepository } from "./blockchain/BlockchainRepository";
import { Config } from "./config";
import { AbstractBroker } from "./core/AbstractBroker";
import { AbstractDbRepository } from "./core/AbstractDbRepository";
import { ContractsWatcher } from "./core/ContractsWatcher";
import { Metrics } from "./metrics";
import { rootLogger } from "./rootLogger";
import { subscribeToUserBalancesLoading } from "./subscriptions/subscribeToUserBalances";

const log = rootLogger.child({ name: "worker" });

const WsStatus = ["CONNECTING", "OPEN", "CLOSING", "CLOSED"];

export class ChainWorker {
  readonly index: number;
  readonly rpc: string;
  readonly directoryAddress: string;
  readonly chainId: number;
  readonly db: AbstractDbRepository;
  readonly broker: AbstractBroker;

  contractsWatcher: ContractsWatcher | undefined;
  blockchain: BlockchainRepository | undefined;
  name: string | undefined;
  restartCount: number = 0;
  blockNumberBeforeDisconnect: number = 0;

  provider: AutoWebSocketProvider | undefined;
  worker: Promise<void> | undefined;

  providerStatus: ProviderStatus = "STARTING";
  wsStatus: string = "STARTING";
  wsWatch: NodeJS.Timeout | undefined;
  pingInterval: NodeJS.Timeout | undefined;
  pongTimeout: NodeJS.Timeout | undefined;
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
    this.index = index;
    this.rpc = rpc;
    this.directoryAddress = directoryAddress;
    this.chainId = chainId;
    this.db = dbRepository;
    this.broker = broker;
  }

  async start() {
    try {
      this.createProvider();
      this.createWorker();
    } catch (err) {
      log.error({ chainId: this.chainId, msg: "Error connecting to network !", err });
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
        log.error({
          chainId: this.chainId,
          msg: "Blockchain provider is down !",
          downtimeSeconds: Math.round(this.cumulatedNodeDowntime / 1000),
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

    log.warn({
      chainId: this.chainId,
      msg: "Blockchain provider was down !",
      downtimeSeconds: Math.round(this.cumulatedNodeDowntime / 1000),
    });

    this.disconnectedTimestamp = -1;
    this.cumulatedNodeDowntime = 0;
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
      if (args[0] === "WebSocket closed") {
        if (this.wsStatus === WsStatus[0]) {
          Metrics.connectionFailed(this.chainId);
        }
        log.warn({
          chainId: this.chainId,
          msg: "Websocket connection lost",
          rpc: this.rpc,
          args,
        });
        this.providerStatus = "DISCONNECTED";
        this.stop();

        this.logDisconnectedStateIfNeeded();
      } else if (typeof args[0] === "string") {
        log.error({
          chainId: this.chainId,
          msg: "Websocket unknown error",
          rpc: this.rpc,
          args,
        });
      }
    });
    this.provider.on("debug", (...args) => {
      log.debug({ chainId: this.chainId, args });
    });

    this.provider.ready
      .then((network) => {
        this.logDowntimeAfterReconnection();

        log.info({
          chainId: this.chainId,
          msg: "Connected to network",
          network,
        });

        if (this.chainId !== network.chainId) {
          throw new Error(`RPC Node returned wrong chain ${JSON.stringify(network)}, expected chainId ${this.chainId}`);
        }

        this.name = network.name;
        this.providerStatus = "CONNECTED";

        return network;
      })
      .catch((err) => {
        log.error({
          chainId: this.chainId,
          msg: "Error connecting to network",
          rpc: this.rpc,
          err,
        });
        this.providerStatus = "DISCONNECTED";
        this.wsStatus = WsStatus[WebSocket.CLOSED];
        Metrics.connectionFailed(this.chainId);
        this.stop();

        this.logDisconnectedStateIfNeeded();
      });

    let prevWsStatus = this.wsStatus;
    this.wsWatch = setInterval(() => {
      if (this.provider?.websocket === undefined) return;

      this.wsStatus = WsStatus[this.provider.websocket.readyState];

      if (this.wsStatus !== prevWsStatus) {
        prevWsStatus = this.wsStatus;

        if (this.providerStatus !== "DISCONNECTED" && ["CLOSING", "CLOSED"].includes(this.wsStatus)) {
          log.warn({
            chainId: this.chainId,
            msg: "Websocket crashed",
            network: this.name,
          });
        }

        if (this.providerStatus !== "CONNECTING" && this.wsStatus === "CONNECTING") {
          log.info({
            chainId: this.chainId,
            msg: "Websocket connecting",
            network: this.name,
          });
        }

        if (this.providerStatus !== "CONNECTED" && this.wsStatus === "OPEN") {
          log.info({
            chainId: this.chainId,
            msg: "Websocket connected",
            network: this.name,
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
        await this.run()
          .then(() => {
            log.info({
              chainId: this.chainId,
              msg: "Worker stopped itself",
              network: this.name,
            });
            this.stop();
          })
          .catch((err: any) => {
            log.error({
              chainId: this.chainId,
              msg: "Worker crashed",
              rpc: this.rpc,
              network: this.name,
              err,
            });
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
      chainId: this.chainId,
      msg: "Starting worker",
      network: this.name,
    });

    try {
      this.blockchain = new BlockchainRepository(this.chainId, this.provider, this.db, this.broker);
      this.contractsWatcher = new ContractsWatcher(this.chainId, this.blockchain);

      await this.contractsWatcher.registerDirectory(this.directoryAddress);

      this.subscribeToNewBlocks();

      this.workerStatus = "STARTED";
      Metrics.workerStarted(this.chainId);

      await subscribeToUserBalancesLoading(this.chainId, this.db, this.blockchain, this.broker);
    } catch (err) {
      log.error({
        chainId: this.chainId,
        msg: "Error happened running worker",
        network: this.name,
        err,
      });
    }
    log.info({
      chainId: this.chainId,
      msg: "Worker stopped",
      network: this.name,
    });
  }

  private async stop() {
    if (this.providerStatus === "DISCONNECTED" && this.workerStatus === "DEAD") return;

    log.debug({
      chainId: this.chainId,
      msg: "Stopping worker",
      network: this.name,
      stack: new Error().stack,
    });

    this.providerStatus = "DISCONNECTED";
    this.workerStatus = "DEAD";

    Metrics.workerStopped(this.chainId);

    await this.contractsWatcher?.unregisterDirectory(this.directoryAddress);

    this.blockchain?.destroy();
    this.blockchain = undefined;

    this.provider?.removeAllListeners();
    this.worker = undefined;

    log.info({ chainId: this.chainId, msg: "Destroying provider", provider: this.provider });
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

    await this.db.deletePendingAndFailedEvents(this.chainId);

    this.restartCount++;
  }
}
