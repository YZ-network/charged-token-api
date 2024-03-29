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

    this.start();
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
          msg: `Websocket connection lost to rpc ${this.rpc}`,
          args,
          chainId: this.chainId,
        });
        this.providerStatus = "DISCONNECTED";
        this.stop();

        this.logDisconnectedStateIfNeeded();
      } else if (typeof args[0] === "string") {
        log.error({
          msg: `Websocket unknown error on ${this.rpc}`,
          args,
          chainId: this.chainId,
        });
      }
    });
    this.provider.on("debug", (...args) => {
      log.debug({ args, chainId: this.chainId });
    });

    this.provider.ready
      .then((network) => {
        this.logDowntimeAfterReconnection();

        log.info({
          msg: "Connected to network",
          network,
          chainId: this.chainId,
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
          msg: `Error connecting to network ${this.rpc}`,
          err,
          chainId: this.chainId,
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
            msg: `Websocket crashed : ${this.name}`,
            chainId: this.chainId,
          });
        }

        if (this.providerStatus !== "CONNECTING" && this.wsStatus === "CONNECTING") {
          log.info({
            msg: `Websocket connecting : ${this.name}`,
            chainId: this.chainId,
          });
        }

        if (this.providerStatus !== "CONNECTED" && this.wsStatus === "OPEN") {
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
        await this.run()
          .then(() => {
            log.info({
              msg: `Worker stopped itself on network ${this.name}`,
              chainId: this.chainId,
            });
            this.stop();
          })
          .catch((err: any) => {
            log.error({
              msg: `Worker crashed on : ${this.rpc}, ${this.name}`,
              err,
              chainId: this.chainId,
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
      msg: `Starting worker on chain ${this.name}`,
      chainId: this.chainId,
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
    if (this.providerStatus === "DISCONNECTED" && this.workerStatus === "DEAD") return;

    log.debug({
      msg: `Stopping worker on chain ${this.name}`,
      chainId: this.chainId,
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
