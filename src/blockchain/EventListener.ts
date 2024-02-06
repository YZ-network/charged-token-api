import { type ethers } from "ethers";
import mongoose, { type ClientSession } from "mongoose";
import { type Logger } from "pino";
import { getBlockDate } from "../globals";
import { EventHandlerStatus } from "../loaders";
import { AbstractDbRepository } from "../loaders/AbstractDbRepository";
import { type AbstractLoader } from "../loaders/AbstractLoader";
import { rootLogger } from "../util";

type EventQueue = Array<{
  eventName: string;
  block: number;
  tx: number;
  ev: number;
  log: ethers.providers.Log;
  loader: AbstractLoader<any>;
  iface: ethers.utils.Interface;
}>;

export class EventListener {
  private readonly _queue: EventQueue = [];
  private readonly db: AbstractDbRepository;
  private readonly provider: ethers.providers.JsonRpcProvider;

  readonly log: Logger = rootLogger.child({ name: "EventListener" });
  private readonly _timer: NodeJS.Timeout | undefined;
  private _running = false;
  private _eventsAdded = false;
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

  constructor(db: AbstractDbRepository, provider: ethers.providers.JsonRpcProvider, startLoop = true) {
    this.db = db;
    this.provider = provider;

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
      }, 100);
    }
  }

  async queueLog(
    eventName: string,
    log: ethers.providers.Log,
    loader: AbstractLoader<any>,
    iface: ethers.utils.Interface,
  ) {
    const decodedLog = iface.parseLog(log);
    const args = [...decodedLog.args.values()].map((arg) => arg.toString());

    this.log.info({
      msg: "queuing event",
      contract: this.constructor.name,
      eventName,
      address: loader.address,
      chainId: loader.chainId,
      blockNumber: log.blockNumber,
      txIndex: log.transactionIndex,
      txHash: log.transactionHash,
      logIndex: log.logIndex,
      args,
      queueSize: this.queue.length,
    });

    if (
      await this.db.existsEvent(loader.chainId, loader.address, log.blockNumber, log.transactionIndex, log.logIndex)
    ) {
      this.log.warn({
        msg: "Tried to queue same event twice !",
        eventName,
        chainId: loader.chainId,
        address: loader.address,
        contract: loader.constructor.name,
        blockNumber: log.blockNumber,
        txIndex: log.transactionIndex,
        logIndex: log.logIndex,
      });
      return;
    }

    this.pushEventAndSort(loader, iface, eventName, log);

    await this.db.saveEvent({
      status: EventHandlerStatus.QUEUED,
      chainId: loader.chainId,
      address: log.address,
      blockNumber: log.blockNumber,
      blockDate: await getBlockDate(log.blockNumber, this.provider),
      txHash: log.transactionHash,
      txIndex: log.transactionIndex,
      logIndex: log.logIndex,
      name: eventName,
      contract: loader.constructor.name,
      topics: log.topics,
      args,
    });
  }

  private pushEventAndSort(
    loader: AbstractLoader<any>,
    iface: ethers.utils.Interface,
    eventName: string,
    log: ethers.providers.Log,
    requeued: boolean = false,
  ): void {
    if (requeued) {
      this.log.info({
        msg: "putting back event in the queue",
        contract: this.constructor.name,
        eventName,
        address: loader.address,
        chainId: loader.chainId,
        blockNumber: log.blockNumber,
        txIndex: log.transactionIndex,
        txHash: log.transactionHash,
        logIndex: log.logIndex,
        queueSize: this.queue.length,
      });
    }

    this._queue.push({
      eventName,
      log,
      block: log.blockNumber,
      tx: log.transactionIndex,
      ev: log.logIndex,
      loader,
      iface,
    });
    this._eventsAdded = true;

    // sort queued events in case they come unordered
    this._queue.sort((a, b) => {
      if (a.block < b.block) return -1;
      if (a.block > b.block) return 1;
      if (a.ev < b.ev) return -1;
      if (a.ev > b.ev) return 1;
      throw new Error(`Found duplicate event while sorting : ${JSON.stringify(a.log)} ${JSON.stringify(b.log)}`);
    });
  }

  async executePendingLogs() {
    if (this._running) return;

    this._running = true;

    const session = await mongoose.startSession();

    let lastBlockNumber = 0;
    while (this.queue.length > 0) {
      const [{ eventName, log, loader, iface }] = this._queue.splice(0, 1);

      this.log.info({
        msg: "Popped event from queue",
        chainId: loader.chainId,
        address: loader.address,
        eventName,
        blockNumber: log.blockNumber,
        txIndex: log.transactionIndex,
        logIndex: log.logIndex,
        txHash: log.transactionHash,
        queueSize: this.queue.length,
      });

      if (
        !(await this.db.existsEvent(
          loader.chainId,
          loader.address,
          log.blockNumber,
          log.transactionIndex,
          log.logIndex,
        ))
      ) {
        this.log.warn({
          msg: "Tried to handle event before saving it in database !",
          chainId: loader.chainId,
          address: loader.address,
          blockNumber: log.blockNumber,
          lastBlockNumber,
          eventName,
          txIndex: log.transactionIndex,
          logIndex: log.logIndex,
          txHash: log.transactionHash,
        });

        this.pushEventAndSort(loader, iface, eventName, log, true);
        break;
      }

      if (lastBlockNumber > 0 && lastBlockNumber !== log.blockNumber) {
        this.log.info({
          msg: "Got events spanned on different blocks, stopping now",
          chainId: loader.chainId,
          address: loader.address,
          blockNumber: log.blockNumber,
          lastBlockNumber,
        });

        this.pushEventAndSort(loader, iface, eventName, log, true);
        break;
      }

      lastBlockNumber = log.blockNumber;

      const decodedLog = iface.parseLog(log);
      const args = [...decodedLog.args.values()];

      try {
        session.startTransaction();

        await loader.onEvent(session, eventName, args, log.blockNumber, log);
        await this.updateEventStatus(session, log, loader.chainId, EventHandlerStatus.SUCCESS);

        await session.commitTransaction();
      } catch (err) {
        this.log.error({
          msg: `Error running event handler on chain ${loader.chainId}`,
          err,
          eventName,
          args,
          chainId: loader.chainId,
          blockNumber: log.blockNumber,
          txIndex: log.transactionIndex,
          logIndex: log.logIndex,
          txHash: log.transactionHash,
        });

        await session.abortTransaction();

        // automatically requeue the failing event
        this.pushEventAndSort(loader, iface, eventName, log, true);

        break;
      }
    }

    await session.endSession();
    this._running = false;
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
    await this.db.updateEventStatus(
      {
        chainId,
        address: log.address,
        blockNumber: log.blockNumber,
        txIndex: log.transactionIndex,
        logIndex: log.logIndex,
      },
      status,
    );
  }
}
