import type { ethers } from "ethers";
import type { Logger } from "pino";
import { Config } from "../config";
import type { AbstractBroker } from "../core/AbstractBroker";
import type { AbstractDbRepository } from "../core/AbstractDbRepository";
import type { AbstractHandler } from "../core/AbstractHandler";
import { rootLogger } from "../rootLogger";
import type { EventListener } from "./EventListener";
import topicsMap from "./topics";

export class EventsLoader {
  private readonly chainId: number;
  private readonly provider: ethers.providers.JsonRpcProvider;
  private readonly eventListener: EventListener;
  private readonly db: AbstractDbRepository;
  private readonly broker: AbstractBroker;
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
    broker: AbstractBroker,
  ) {
    this.chainId = chainId;
    this.provider = provider;
    this.eventListener = eventListener;
    this.db = db;
    this.broker = broker;

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
        await this.loadBlockTransactions(fromBlock, toBlock);
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

  private async loadBlockTransactions(fromBlock: number, toBlock: number): Promise<void> {
    const blockTransactions: { blockNumber: number; hash: string }[] = [];
    for (let i = fromBlock; i <= toBlock; i++) {
      const block = await this.provider.getBlock(i);
      blockTransactions.push(...block.transactions.map((hash) => ({ blockNumber: block.number, hash })));
    }

    await Promise.all(
      blockTransactions.map(async ({ blockNumber, hash }) => {
        try {
          await this.db.saveTransaction({ chainId: this.chainId, hash });
          await this.broker.notifyTransaction(this.chainId, hash);
        } catch (err) {
          this.log.warn({ msg: "Unique transaction violation detected", blockNumber, hash, err });
        }
      }),
    );
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

    const knownEvents = knownContractsEvents
      .filter((event) => knownTopics.includes(event.topics[0]))
      .sort((a, b) => {
        if (a.blockNumber < b.blockNumber) return -1;
        if (a.blockNumber > b.blockNumber) return 1;
        if (a.logIndex < b.logIndex) return -1;
        if (a.logIndex > b.logIndex) return 1;
        throw new Error(`Found duplicate event while sorting : ${JSON.stringify(a)} ${JSON.stringify(b)}`);
      })
      .map((log) => {
        const contract = this.contracts[log.address];
        const eventName = topicsMap[contract.dataType][log.topics[0]];
        return {
          log,
          eventName,
          ...contract,
        };
      });

    this.log.debug({ msg: "On watched topics", count: knownEvents.length });

    await this.eventListener.handleEvents(knownEvents);

    this.lastLoadedBlock = toBlock;

    try {
      await this.db.setLastUpdateBlock(this.chainId, toBlock);
    } catch (err) {
      this.log.error({ msg: "Failed setting last update block", lastUpdateBlock: toBlock, err });
    }
  }
}
