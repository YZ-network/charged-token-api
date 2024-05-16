import { Config } from "./config";
import type { AbstractBroker } from "./core/AbstractBroker";
import type { AbstractDbRepository } from "./core/AbstractDbRepository";
import { AbstractWorkerManager } from "./core/AbstractWorkerManager";
import { Metrics } from "./metrics";
import { rootLogger } from "./rootLogger";
import { ChainWorker } from "./worker";

export class WorkerManager extends AbstractWorkerManager {
  private readonly log = rootLogger.child({ name: "WorkerManager" });

  private readonly db: AbstractDbRepository;
  private readonly broker: AbstractBroker;

  private readonly networks: JsonNetworkConfig[];
  private readonly workers: ChainWorker[];

  private watchdog: NodeJS.Timeout | undefined;

  constructor(db: AbstractDbRepository, broker: AbstractBroker) {
    super();

    this.db = db;
    this.broker = broker;

    this.networks = Config.networks.filter((network) => network.enabled === true);
    this.workers = [];
  }

  async start(): Promise<void> {
    await Promise.all(
      this.networks.map((network, index) => this.connectChain(index, network.uri, network.directory, network.chainId)),
    );

    this.startWatchdog();
  }

  getStatus(): ChainHealth[] {
    return this.workers.map((worker) => worker.status());
  }

  async destroy(): Promise<void> {
    if (this.watchdog !== undefined) {
      clearInterval(this.watchdog);
      this.watchdog = undefined;
    }

    await Promise.all(this.workers.map((worker) => worker.stop()));
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

    try {
      await worker.start();
    } catch (err) {
      this.log.error({
        chainId,
        msg: "Error starting worker !",
        rpc,
        directory,
        err,
      });
    }
  }

  private startWatchdog() {
    this.watchdog = setInterval(async () => {
      for (const worker of this.workers) {
        if (worker.workerStatus === "DEAD") {
          await this.onDeadWorker(worker);
        }
      }
    }, Config.delays.workerRestartDelayMs);
  }

  private async onDeadWorker(worker: ChainWorker): Promise<void> {
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
