import { ethers } from "ethers";
import mongoose, { ClientSession } from "mongoose";
import { Logger } from "pino";
import { EventHandlerStatus, EventModel } from "../models/Event";
import { rootLogger } from "../util";
import { AbstractLoader } from "./AbstractLoader";

export class EventListener {
  private readonly queue: {
    eventName: string;
    block: number;
    tx: number;
    ev: number;
    log: ethers.providers.Log;
    loader: AbstractLoader<any>;
  }[] = [];
  private log: Logger = rootLogger.child({ name: "EventListener" });
  private readonly timer: NodeJS.Timer;
  private running = false;
  private eventsAdded = false;

  constructor() {
    this.timer = setInterval(() => {
      if (this.queue.length > 0 && !this.eventsAdded) {
        this.executePendingLogs();
      } else {
        this.eventsAdded = false;
      }
    }, 1000);
  }

  async queueLog(
    eventName: string,
    log: ethers.providers.Log,
    loader: AbstractLoader<any>
  ) {
    this.queue.push({
      eventName,
      log,
      block: log.blockNumber,
      tx: log.transactionIndex,
      ev: log.logIndex,
      loader,
    });

    await EventModel.create({
      status: EventHandlerStatus.QUEUED,
      chainId: loader.chainId,
      address: log.address,
      blockNumber: log.blockNumber,
      txHash: log.transactionHash,
      txIndex: log.transactionIndex,
      logIndex: log.logIndex,
      name: eventName,
      topics: log.topics,
    });

    /*
    this.queue.sort((a, b) => {
      if (a.block < b.block) return -1;
      if (a.block > b.block) return 1;
      if (a.tx < b.tx) return -1;
      if (a.tx > b.tx) return 1;
      if (a.ev < b.ev) return -1;
      if (a.ev > b.ev) return 1;
      throw new Error(`Found duplicate event while sorting : ${a} ${b}`);
    });
    */

    this.eventsAdded = true;
  }

  async executePendingLogs() {
    if (this.running) return;

    this.running = true;

    try {
      const session = await mongoose.startSession();
      await session.withTransaction(async () => {
        let lastBlockNumber = 0;
        while (this.queue.length > 0) {
          const [{ eventName, log, loader }] = this.queue;

          if (lastBlockNumber > 0 && lastBlockNumber !== log.blockNumber) {
            loader.log.info({
              msg: "Got events spanned on different blocks, stopping now",
              chainId: loader.chainId,
              blockNumber: log.blockNumber,
              lastBlockNumber,
            });
            break;
          } else {
            lastBlockNumber = log.blockNumber;
          }

          const decodedLog = loader.iface.parseLog(log);
          const args = [...decodedLog.args.values()];

          try {
            await loader.onEvent(session, eventName, args, log.blockNumber);
            await this.updateEventStatus(
              session,
              log,
              loader.chainId,
              EventHandlerStatus.SUCCESS
            );
            this.queue.splice(0, 1);
          } catch (err) {
            loader.log.error({
              msg: `Error running event handler on chain ${loader.chainId}`,
              err,
              eventName,
              args,
              chainId: loader.chainId,
              blockNumber: log.blockNumber,
            });
            await this.updateEventStatus(
              session,
              log,
              loader.chainId,
              EventHandlerStatus.FAILURE
            );
          }
        }
      });
      await session.endSession();
    } catch (err) {
      this.log.error({ msg: "Event handlers execution failed !", err });
      throw err;
    } finally {
      this.running = false;
    }
  }

  destroy() {
    if (this.timer !== undefined) clearInterval(this.timer);
  }

  private async updateEventStatus(
    session: ClientSession,
    log: ethers.providers.Log,
    chainId: number,
    status: EventHandlerStatus
  ) {
    await EventModel.updateOne(
      {
        chainId,
        address: log.address,
        blockNumber: log.blockNumber,
        txIndex: log.transactionIndex,
        logIndex: log.logIndex,
      },
      {
        status,
      },
      { session }
    );
  }
}
