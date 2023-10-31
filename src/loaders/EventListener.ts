import { type ethers } from "ethers";
import mongoose, { type ClientSession } from "mongoose";
import { type Logger } from "pino";
import { EventHandlerStatus } from "../enums";
import { EventModel } from "../models";
import { rootLogger } from "../util";
import { type AbstractLoader } from "./AbstractLoader";

type EventQueue = Array<{
  eventName: string;
  block: number;
  tx: number;
  ev: number;
  log: ethers.providers.Log;
  loader: AbstractLoader<any>;
}>;

export class EventListener {
  private readonly _queue: EventQueue = [];

  private readonly log: Logger = rootLogger.child({ name: "EventListener" });
  private readonly _timer: NodeJS.Timeout | undefined;
  private _running = false;
  private _eventsAdded = false;
  private readonly blockDates: Record<number, string> = {};
  private _executingEventHandlers = false;

  get queue(): EventQueue {
    return this._queue;
  }

  get executingEventHandlers(): boolean {
    return this._executingEventHandlers;
  }

  get eventsAdded(): boolean {
    return this._eventsAdded;
  }

  get running(): boolean {
    return this._running;
  }

  get timer(): NodeJS.Timeout | undefined {
    return this._timer;
  }

  constructor(startLoop = true) {
    if (startLoop) {
      this._timer = setInterval(() => {
        if (!this._executingEventHandlers) {
          if (this._queue.length > 0 && !this._eventsAdded) {
            this._executingEventHandlers = true;
            this.executePendingLogs()
              .then(() => (this._executingEventHandlers = false))
              .catch(() => (this._executingEventHandlers = false));
          } else {
            this._eventsAdded = false;
          }
        }
      }, 50);
    }
  }

  private async getBlockDate(blockNumber: number, provider: ethers.providers.JsonRpcProvider): Promise<string> {
    if (this.blockDates[blockNumber] === undefined) {
      const block = await provider.getBlock(blockNumber);
      const blockDate = new Date(block.timestamp * 1000).toISOString();
      this.blockDates[blockNumber] = blockDate;
    }
    return this.blockDates[blockNumber];
  }

  async queueLog(eventName: string, log: ethers.providers.Log, loader: AbstractLoader<any>) {
    if (
      (await EventModel.exists({
        chainId: loader.chainId,
        address: loader.address,
        blockNumber: log.blockNumber,
        txIndex: log.transactionIndex,
        logIndex: log.logIndex,
      })) !== null
    ) {
      throw new Error(
        `Tried to queue same event twice ! event=${eventName} chainId=${loader.chainId} address=${loader.address} blockNumber=${log.blockNumber} txIndex=${log.transactionIndex} logIndex=${log.logIndex}`,
      );
    }

    this._queue.push({
      eventName,
      log,
      block: log.blockNumber,
      tx: log.transactionIndex,
      ev: log.logIndex,
      loader,
    });

    const decodedLog = loader.iface.parseLog(log);
    const args = [...decodedLog.args.values()];

    await EventModel.create({
      status: EventHandlerStatus.QUEUED,
      chainId: loader.chainId,
      address: log.address,
      blockNumber: log.blockNumber,
      blockDate: await this.getBlockDate(log.blockNumber, loader.provider),
      txHash: log.transactionHash,
      txIndex: log.transactionIndex,
      logIndex: log.logIndex,
      name: eventName,
      contract: loader.constructor.name,
      topics: log.topics,
      args: args.map((arg) => arg.toString()),
    });

    // sort queued events in case they come unordered
    this.queue.sort((a, b) => {
      if (a.block < b.block) return -1;
      if (a.block > b.block) return 1;
      if (a.tx < b.tx) return -1;
      if (a.tx > b.tx) return 1;
      if (a.ev < b.ev) return -1;
      if (a.ev > b.ev) return 1;
      throw new Error(`Found duplicate event while sorting : ${a} ${b}`);
    });

    this._eventsAdded = true;
  }

  async executePendingLogs() {
    if (this._running) return;

    this._running = true;

    const session = await mongoose.startSession();

    try {
      let lastBlockNumber = 0;
      while (this._queue.length > 0) {
        const [{ eventName, log, loader }] = this._queue;

        if (lastBlockNumber > 0 && lastBlockNumber !== log.blockNumber) {
          loader.log.info({
            msg: "Got events spanned on different blocks, stopping now",
            chainId: loader.chainId,
            blockNumber: log.blockNumber,
            lastBlockNumber,
          });
          break;
        }

        lastBlockNumber = log.blockNumber;

        const decodedLog = loader.iface.parseLog(log);
        const args = [...decodedLog.args.values()];

        try {
          session.startTransaction();

          await loader.onEvent(session, eventName, args, log.blockNumber);
          await this.updateEventStatus(session, log, loader.chainId, EventHandlerStatus.SUCCESS);
          this._queue.splice(0, 1);

          await session.commitTransaction();
        } catch (err) {
          await session.abortTransaction();

          loader.log.error({
            msg: `Error running event handler on chain ${loader.chainId}`,
            err,
            eventName,
            args,
            chainId: loader.chainId,
            blockNumber: log.blockNumber,
          });
          await this.updateEventStatus(session, log, loader.chainId, EventHandlerStatus.FAILURE);
          break;
        }
      }

      await session.endSession();
      this._running = false;
    } catch (err) {
      this.log.error({ msg: "Event handlers execution failed !", err });
      throw err;
    }
  }

  destroy() {
    if (this._timer !== undefined) clearInterval(this._timer);
  }

  private async updateEventStatus(
    session: ClientSession,
    log: ethers.providers.Log,
    chainId: number,
    status: EventHandlerStatus,
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
      { session },
    );
  }
}
