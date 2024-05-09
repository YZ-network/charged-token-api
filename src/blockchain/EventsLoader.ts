import { ethers } from "ethers";
import { Logger } from "pino";
import { Config } from "../config";
import { AbstractDbRepository } from "../core/AbstractDbRepository";
import { AbstractHandler } from "../core/AbstractHandler";
import { rootLogger } from "../rootLogger";
import { EventListener } from "./EventListener";
import topicsMap from "./topics";

export class EventsLoader {
  private readonly chainId: number;
  private readonly provider: ethers.providers.JsonRpcProvider;
  private readonly eventListener: EventListener;
  private readonly db: AbstractDbRepository;
  private readonly log: Logger;

  private readonly blocksLag = Config.blocks.lag;
  private readonly blocksBuffer = Config.blocks.buffer;
  private contracts: Record<
    string,
    { dataType: DataType; loader: AbstractHandler<any>; iface: ethers.utils.Interface }
  > = {};

  lastLoadedBlock: number = 0;

  constructor(
    chainId: number,
    provider: ethers.providers.JsonRpcProvider,
    eventListener: EventListener,
    db: AbstractDbRepository,
  ) {
    this.chainId = chainId;
    this.provider = provider;
    this.eventListener = eventListener;
    this.db = db;

    this.log = rootLogger.child({ chainId, name: "EventsLoader" });
  }

  watchContract(dataType: DataType, address: string, loader: AbstractHandler<any>, iface: ethers.utils.Interface) {
    this.contracts[address] = { dataType, loader, iface };
  }

  forgetContract(address: string) {
    delete this.contracts[address];
  }

  async start(fromBlock: number) {
    if (this.provider === undefined) {
      throw new Error("No provider to subscribe for new blocks !");
    }

    try {
      await this.db.setLastUpdateBlock(this.chainId, fromBlock);
    } catch (err) {
      this.log.error({ msg: "Failed setting last update block", lastUpdateBlock: fromBlock, err });
    }

    this.lastLoadedBlock = fromBlock;
    this.provider.on("block", (blockNumber: number) => this.onNewBlock(blockNumber));
  }

  destroy() {
    this.provider.off("block");
    this.contracts = {};
  }

  private async onNewBlock(blockNumber: number) {
    this.log.debug({
      msg: "New block header",
      blockNumber,
      lastLoadedBlock: this.lastLoadedBlock,
    });

    const fromBlock = this.lastLoadedBlock + 1;
    const toBlock = blockNumber - this.blocksLag;
    if (toBlock - fromBlock >= this.blocksBuffer - 1) {
      try {
        await this.loadBlockEvents(fromBlock, toBlock);
      } catch (err) {
        const errorMessage = (err as Error).message;
        if (errorMessage.includes("not processed yet")) {
          this.log.warn({
            msg: "Could not load new block events, consider increasing blocks lag",
            fromBlock,
            toBlock,
            blockNumber,
            err: errorMessage,
          });
        } else {
          this.log.error({
            msg: "Unexpected error loading events !",
            fromBlock,
            toBlock,
            blockNumber,
            err: errorMessage,
          });
        }
      }
    }
  }

  private async loadBlockEvents(fromBlock: number, toBlock: number): Promise<void> {
    const knownTopics = Object.values(topicsMap).flatMap((topics) => Object.keys(topics));

    const eventFilter = {
      fromBlock,
      toBlock,
    };

    this.log.debug({ msg: "Loading events", eventFilter });

    const events = await this.provider.getLogs(eventFilter);

    this.log.debug({ msg: "Found events", count: events.length });

    const knownContractsEvents = events.filter((event) => this.contracts[event.address] !== undefined);

    this.log.debug({ msg: "On watched contracts", count: knownContractsEvents.length });

    const knownEvents = knownContractsEvents.filter((event) => knownTopics.includes(event.topics[0]));

    this.log.debug({ msg: "On watched topics", count: knownEvents.length });

    for (const log of knownEvents) {
      const { dataType, loader, iface } = this.contracts[log.address];

      const eventName = topicsMap[dataType][log.topics[0]];

      try {
        await this.eventListener.queueLog(eventName, log, loader, iface);
      } catch (err) {
        this.log.error({
          msg: "error queuing event",
          address: log.address,
          dataType,
          eventName,
          err,
          log,
        });
      }
    }

    this.lastLoadedBlock = toBlock;

    try {
      await this.db.setLastUpdateBlock(this.chainId, toBlock);
    } catch (err) {
      this.log.error({ msg: "Failed setting last update block", lastUpdateBlock: toBlock, err });
    }
  }
}
