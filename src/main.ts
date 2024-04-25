import { Server } from "http";
import mongoose from "mongoose";
import { configureApiServer } from "./api/server";
import { Broker } from "./broker";
import { ApiVersion, Config } from "./config";
import { DbRepository } from "./db/DbRepository";
import { Metrics } from "./metrics";
import { rootLogger } from "./rootLogger";
import { ChainWorker } from "./worker";

export class MainClass {
  private readonly log = rootLogger.child({ name: "Main" });
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
    this.log.info({ msg: "Starting API", version: ApiVersion, config: Config });

    this.log.info({ msg: "Connecting to MongoDB", mongouri: Config.db.uri });

    try {
      await this.connectDB();

      this.log.info("MongoDB connected !");

      await Promise.all(
        this.networks.map((network, index) =>
          this.connectChain(index, network.uri, network.directory, network.chainId),
        ),
      );

      this.keepAlive = setInterval(async () => {
        for (const worker of this.workers) {
          if (worker.workerStatus === "DEAD") {
            this.log.info({
              chainId: worker.chainId,
              msg: "Restarting worker",
              worker: worker.name,
              rpc: worker.rpc,
            });

            try {
              await worker.start();

              this.log.info({
                chainId: worker.chainId,
                msg: "Worker restarted",
                worker: worker.name,
                rpc: worker.rpc,
              });
            } catch (err) {
              this.log.error({
                chainId: worker.chainId,
                msg: "Worker start failed !",
                worker: worker.name,
                rpc: worker.rpc,
                err,
              });
            }
          }
        }
      }, Config.delays.workerRestartDelayMs);

      this.healthTimer = setInterval(() => {
        this.log.trace("pushing health status");
        this.broker.notifyHealth(this.health());
      }, Config.delays.healthPublishDelayMs);

      this.httpServer.listen(this.bindPort, this.bindAddress, () => {
        this.log.info({ msg: "GraphQL API server started", address: this.bindAddress, port: this.bindPort });
      });
    } catch (err) {
      this.log.error({ msg: "Error during application startup !", err });

      if (this.keepAlive !== undefined) {
        clearInterval(this.keepAlive);
        this.keepAlive = undefined;
      }
      if (this.healthTimer !== undefined) {
        clearInterval(this.healthTimer);
        this.healthTimer = undefined;
      }

      await this.broker.destroy();
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
    this.log.info({
      chainId,
      msg: "Creating provider and starting worker",
      rpc,
      directory,
    });

    Metrics.chainInit(chainId);

    const worker = new ChainWorker(index, rpc, directory, chainId, this.db, this.broker);

    this.workers.push(worker);

    await worker.start().catch((err) =>
      this.log.error({
        chainId,
        msg: "Error starting worker !",
        rpc,
        directory,
        err,
      }),
    );
  }
}

export const Main = new MainClass();
