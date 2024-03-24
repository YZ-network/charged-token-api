import { Server } from "http";
import mongoose from "mongoose";
import { configureApiServer } from "./api/server";
import { Broker } from "./broker";
import { ApiVersion, Config } from "./config";
import { DbRepository } from "./db/DbRepository";
import { Metrics } from "./metrics";
import { rootLogger } from "./rootLogger";
import { ChainWorker } from "./worker";

const log = rootLogger.child({ name: "Main" });

export class MainClass {
  readonly networks = Config.networks.filter((network) => network.enabled === true);

  keepAlive: NodeJS.Timeout | undefined;
  healthTimer: NodeJS.Timeout | undefined;

  readonly db: DbRepository = new DbRepository();
  readonly broker: Broker = new Broker();
  readonly workers: ChainWorker[] = [];

  readonly httpServer: Server = configureApiServer(this.db, this.broker);

  readonly bindAddress = Config.api.bindAddress;
  readonly bindPort = Config.api.bindPort;

  async start(): Promise<void> {
    log.info(`Connecting to MongoDB at ${Config.db.uri}`);

    try {
      await this.connectDB();

      log.info("MongoDB connected !");

      this.networks.forEach((network, index) => {
        this.connectChain(index, network.uri, network.directory, network.chainId);
      });

      this.keepAlive = setInterval(() => {
        for (const worker of this.workers) {
          if (worker.workerStatus === "DEAD") {
            log.info({
              msg: `Restarting worker on rpc ${worker.rpc} and chain ${worker.name} ${worker.chainId}`,
              chainId: worker.chainId,
            });
            worker.start();
          }
        }
      }, Config.delays.workerRestartDelayMs);

      this.healthTimer = setInterval(() => {
        log.debug({ msg: "pushing health status" });
        this.broker.notifyHealth(this.health());
      }, Config.delays.healthPublishDelayMs);

      this.httpServer.listen(this.bindPort, this.bindAddress, () => {
        log.info(`GraphQL API server started at http://${this.bindAddress}:${this.bindPort}/`);
      });
    } catch (err) {
      log.error({ msg: "Error during application startup !", err });
      if (this.keepAlive !== undefined) {
        clearInterval(this.keepAlive);
        this.keepAlive = undefined;
      }
      if (this.healthTimer !== undefined) {
        clearInterval(this.healthTimer);
        this.healthTimer = undefined;
      }
    }
  }

  health(): ChainHealth[] {
    return this.workers.map((worker) => worker.status());
  }

  private async connectDB(): Promise<typeof mongoose> {
    mongoose.set("strictQuery", true);
    return await mongoose.connect(Config.db.uri);
  }

  private connectChain(index: number, rpc: string, directory: string, chainId: number): void {
    log.info({
      chainId,
      msg: `Creating provider and starting worker for network ${chainId} : ${rpc} and directory ${directory}`,
    });

    Metrics.chainInit(chainId);
    this.workers.push(new ChainWorker(index, rpc, directory, chainId, this.db, this.broker));
  }
}

log.info({ msg: "Starting API", version: ApiVersion });

export const Main = new MainClass();
