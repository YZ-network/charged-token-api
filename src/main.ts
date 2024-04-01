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
    log.info({ mongouri: Config.db.uri, msg: "Connecting to MongoDB" });

    try {
      await this.connectDB();

      log.info("MongoDB connected !");

      await this.networks.map((network, index) =>
        this.connectChain(index, network.uri, network.directory, network.chainId),
      );

      this.keepAlive = setInterval(() => {
        for (const worker of this.workers) {
          if (worker.workerStatus === "DEAD") {
            log.info({
              chainId: worker.chainId,
              name: worker.name,
              rpc: worker.rpc,
              msg: "Restarting worker",
            });
            worker
              .start()
              .then(() =>
                log.info({
                  chainId: worker.chainId,
                  name: worker.name,
                  rpc: worker.rpc,
                  msg: "Worker restarted",
                }),
              )
              .catch((err) =>
                log.error({
                  chainId: worker.chainId,
                  name: worker.name,
                  rpc: worker.rpc,
                  msg: "Worker start failed !",
                  err,
                }),
              );
          }
        }
      }, Config.delays.workerRestartDelayMs);

      this.healthTimer = setInterval(() => {
        log.debug({ msg: "pushing health status" });
        this.broker.notifyHealth(this.health());
      }, Config.delays.healthPublishDelayMs);

      this.httpServer.listen(this.bindPort, this.bindAddress, () => {
        log.info({ address: this.bindAddress, port: this.bindPort, msg: "GraphQL API server started" });
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

  private async connectChain(index: number, rpc: string, directory: string, chainId: number): Promise<void> {
    log.info({
      chainId,
      rpc,
      directory,
      msg: "Creating provider and starting worker",
    });

    Metrics.chainInit(chainId);

    const worker = new ChainWorker(index, rpc, directory, chainId, this.db, this.broker);

    this.workers.push(worker);

    await worker.start().catch((err) =>
      log.error({
        chainId,
        msg: "Error starting worker !",
        rpc,
        directory,
        err,
      }),
    );
  }
}

log.info({ msg: "Starting API", version: ApiVersion, config: Config });

export const Main = new MainClass();
