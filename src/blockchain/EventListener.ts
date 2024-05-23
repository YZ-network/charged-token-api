import { type ethers } from "ethers";
import { type Logger } from "pino";
import type { AbstractDbRepository } from "../core/AbstractDbRepository";
import { type AbstractHandler } from "../core/AbstractHandler";
import { rootLogger } from "../rootLogger";
import { getBlockDate } from "./functions";

export class EventListener {
  private readonly db: AbstractDbRepository;
  private readonly provider: ethers.providers.JsonRpcProvider;

  readonly log: Logger = rootLogger.child({ name: "EventListener" });

  constructor(db: AbstractDbRepository, provider: ethers.providers.JsonRpcProvider) {
    this.log = rootLogger.child({ name: "Events" });

    this.db = db;
    this.provider = provider;
  }

  async handleEvents(
    logs: {
      eventName: string;
      log: ethers.providers.Log;
      dataType: DataType;
      loader: AbstractHandler<any>;
      iface: ethers.utils.Interface;
    }[],
  ): Promise<void> {
    for (const log of logs) {
      try {
        await this.handleEvent(log.loader, log.iface, log.eventName, log.log);
      } catch (err) {
        this.log.error({
          msg: "error handling event",
          address: log.log.address,
          dataType: log.dataType,
          eventName: log.eventName,
          err,
          log: log.log,
        });
      }
    }
  }

  async handleEvent(
    loader: AbstractHandler<any>,
    iface: ethers.utils.Interface,
    eventName: string,
    log: ethers.providers.Log,
  ): Promise<void> {
    const decodedLog = iface.parseLog(log);
    const args = [...decodedLog.args.values()];
    const blockDate = await getBlockDate(log.blockNumber, this.provider);

    await this.db.saveEvent({
      status: "QUEUED",
      chainId: loader.chainId,
      address: log.address,
      blockNumber: log.blockNumber,
      blockDate,
      txHash: log.transactionHash,
      txIndex: log.transactionIndex,
      logIndex: log.logIndex,
      name: eventName,
      contract: loader.dataType,
      topics: log.topics,
      args,
    });

    const session = await this.db.startSession();

    try {
      await session.startTransaction();
      await loader.onEvent(session, eventName, args, log.blockNumber, log);
      await session.commitTransaction();

      await this.updateEventStatus(log, loader.chainId, "SUCCESS");
    } catch (err) {
      this.log.error({
        chainId: loader.chainId,
        contract: loader.constructor.name,
        eventName,
        args,
        msg: "Error running event handler",
        txHash: log.transactionHash,
        err,
        blockNumber: log.blockNumber,
        txIndex: log.transactionIndex,
        logIndex: log.logIndex,
      });

      await session.abortTransaction();
      await this.updateEventStatus(log, loader.chainId, "FAILURE");
    }

    await session.endSession();
  }

  private async updateEventStatus(log: ethers.providers.Log, chainId: number, status: EventHandlerStatus) {
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
