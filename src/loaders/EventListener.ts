import { BigNumber, ethers } from "ethers";
import mongoose from "mongoose";
import { AbstractLoader } from "./AbstractLoader";

export class EventListener {
  private readonly loader: AbstractLoader<any>;
  private readonly queue: {
    eventName: string;
    block: number;
    tx: number;
    ev: number;
    log: ethers.providers.Log;
  }[] = [];
  private readonly timer: NodeJS.Timer;

  constructor(loader: AbstractLoader<any>) {
    this.loader = loader;
    this.timer = setInterval(() => {
      if (!this.queueHasHoles()) {
        this.executePendingLogs();
      }
    }, 1000);
  }

  queueHasHoles(): boolean {
    if (this.queue.length === 0) {
      return true;
    }
    if (this.queue[0].ev > 0) {
      this.loader.log.info("First event in queue is not indexed zero, waiting");
      return true;
    }

    let { block, tx, ev } = this.queue[0];

    for (const logEntry of this.queue) {
      if ((logEntry.block > block || logEntry.tx > tx) && ev !== 0) {
        this.loader.log.info(
          "Event block or tx changed but event not indexed at zero, waiting"
        );
        return true;
      }
      block = logEntry.block;
      tx = logEntry.tx;

      if (logEntry.ev - ev > 1) {
        this.loader.log.info(
          "Missing an event between two in same tx, waiting"
        );
        return true;
      }

      ev = logEntry.ev;
    }

    return false;
  }

  queueLog(eventName: string, log: ethers.providers.Log) {
    this.queue.push({
      eventName,
      log,
      block: log.blockNumber,
      tx: log.transactionIndex,
      ev: log.logIndex,
    });
    this.queue.sort((a, b) => {
      if (a.block < b.block) return -1;
      if (a.block > b.block) return 1;
      if (a.tx < b.tx) return -1;
      if (a.tx > b.tx) return 1;
      if (a.ev < b.ev) return -1;
      if (a.ev > b.ev) return 1;
      throw new Error(`Found duplicate event while sorting : ${a} ${b}`);
    });
  }

  async executePendingLogs() {
    const session = await mongoose.startSession();
    await session.withTransaction(async () => {
      while (this.queue.length > 0) {
        const [{ eventName, log }] = this.queue;

        const decodedLog = this.loader.iface.parseLog(log);
        const args = [...decodedLog.args.values()];

        this.loader.log.info({
          msg: `Calling event handler ${eventName} block=${log.blockNumber} txIdx=${log.transactionIndex} evIdx=${log.logIndex}`,
          args: args.map((arg) =>
            arg instanceof BigNumber ? arg.toString() : arg
          ),
        });

        try {
          await this.loader.onEvent(session, eventName, args);
          this.queue.splice(0, 1);
        } catch (err) {
          this.loader.log.error({
            msg: `Error running event handler on chain ${this.loader.chainId}`,
            err,
            eventName,
            args,
          });
        }
      }
    });
    await session.endSession();
  }
}
