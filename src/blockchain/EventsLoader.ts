import type { ethers } from "ethers";
import type { Logger } from "pino";
import { Config } from "../config";
import type { AbstractBroker } from "../core/AbstractBroker";
import type { AbstractDbRepository } from "../core/AbstractDbRepository";
import type { AbstractHandler } from "../core/AbstractHandler";
import { Metrics } from "../metrics";
import { rootLogger } from "../rootLogger";
import type { AutoWebSocketProvider } from "./AutoWebSocketProvider";
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
    Metrics.setBlocksDelta(this.chainId, 0);
    this.provider.off("block");
    this.contracts = {};
  }

  private async onNewBlock(blockNumber: number) {
    Metrics.setBlocksDelta(this.chainId, blockNumber - this.lastLoadedBlock);

    this.log.debug({
      msg: "New block header",
      blockNumber,
      lastLoadedBlock: this.lastLoadedBlock,
    });

    const fromBlock = this.lastLoadedBlock + 1;
    const toBlock = blockNumber - this.blocksLag;

    if (toBlock - fromBlock >= 1000) {
      this.log.warn("Blocks delta threshold exceeded ! Blockchain reset ! Worker restart needed.");
      await this.db.resetChainData(this.chainId);
      await (this.provider as AutoWebSocketProvider).destroy();
      return;
    }

    if (toBlock - fromBlock >= this.blocksBuffer - 1) {
      try {
        const txHashes = await this.loadBlockEvents(fromBlock, toBlock);

        this.lastLoadedBlock = toBlock;
        Metrics.setBlocksDelta(this.chainId, blockNumber - this.lastLoadedBlock);

        if (txHashes.length > 0) {
          await Promise.all(txHashes.map((hash) => this.broker.notifyTransaction(this.chainId, hash)));
        }
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
            err,
          });

          if ((err as Error).message.includes("Log response size exceeded")) {
            this.log.warn("Blockchain reset ! Worker restart needed.");
            await this.db.resetChainData(this.chainId);
            await (this.provider as AutoWebSocketProvider).destroy();
          }
        }
      }
    }
  }

  private async loadBlockEvents(fromBlock: number, toBlock: number): Promise<string[]> {
    const txHashes = new Set<string>();
    const knownTopics = [...new Set(Object.values(topicsMap).flatMap((topics) => Object.keys(topics)))];

    this.log.debug({ msg: "Loading events", fromBlock, toBlock });

    const events = [];
    for (let i = 0; i < knownTopics.length; i += 4) {
      const eventFilter = {
        fromBlock,
        toBlock,
        topics: knownTopics.slice(i, i+4),
      };

      events.push(...(await this.provider.getLogs(eventFilter));
    }

    this.log.debug({ msg: "Found events", count: events.length });

    const knownContractsEvents = events.filter((event) => this.contracts[event.address] !== undefined);

    this.log.debug({ msg: "On watched contracts", count: knownContractsEvents.length });

    const knownEvents = knownContractsEvents
      .sort((a, b) => {
        if (a.blockNumber < b.blockNumber) return -1;
        if (a.blockNumber > b.blockNumber) return 1;
        if (a.logIndex < b.logIndex) return -1;
        if (a.logIndex > b.logIndex) return 1;
        throw new Error(`Found duplicate event while sorting : ${JSON.stringify(a)} ${JSON.stringify(b)}`);
      })
      .map((log) => {
        txHashes.add(log.transactionHash);
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

    try {
      await this.db.setLastUpdateBlock(this.chainId, toBlock);
    } catch (err) {
      this.log.error({ msg: "Failed setting last update block", lastUpdateBlock: toBlock, err });
    }

    return [...txHashes.values()];
  }
}
