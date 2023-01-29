import { ethers } from "ethers";
import { FlattenMaps, HydratedDocument, Model } from "mongoose";
import { IContract, IEventHandler } from "../types";

export abstract class AbstractLoader<T extends IContract> {
  protected readonly provider: ethers.providers.JsonRpcProvider;
  protected readonly address: string;
  protected readonly contract: any;
  protected readonly model: Model<T>;
  protected readonly eventsWatchlist: string[];
  protected readonly instance: ethers.Contract;
  protected lastUpdateBlock: number = 0;
  protected actualBlock: number = 0;
  protected lastState: FlattenMaps<T> | undefined;

  protected constructor(
    provider: ethers.providers.JsonRpcProvider,
    address: string,
    contract: any,
    model: Model<T>,
    eventsWatchlist: string[] = []
  ) {
    this.provider = provider;
    this.address = address;
    this.contract = contract;
    this.model = model;
    this.eventsWatchlist = eventsWatchlist;

    this.instance = new ethers.Contract(address, contract.abi, provider);
  }

  async init(): Promise<void> {
    this.actualBlock = await this.provider.getBlockNumber();

    const existing = await this.get();

    if (existing != null) {
      console.log("found existing one");
      this.lastUpdateBlock = existing.lastUpdateBlock;
      this.lastState = existing.toJSON();
      await this.syncEvents(this.lastUpdateBlock);
    } else {
      this.lastState = (await this.saveOrUpdate(await this.load())).toJSON();
      this.lastUpdateBlock = this.actualBlock;
    }

    this.subscribeToEvents();
  }

  abstract load(): Promise<T>;

  abstract toModel(data: T): HydratedDocument<T>;

  async exists(): Promise<boolean> {
    return (await this.model.exists({ address: this.address })) !== null;
  }

  async get() {
    return await this.model.findOne({ address: this.address });
  }

  async saveOrUpdate(data: T): Promise<HydratedDocument<T>> {
    if (await this.exists()) {
      console.log("existing update");
      await this.model.updateOne({ address: this.address }, data);
    } else {
      console.log("first time save");
      await this.toModel(data).save();
    }

    console.log("fetch entity");
    const result = await this.get();
    if (result === null) {
      console.log("daaaamn");
      throw new Error("Error connecting to database !");
    }

    this.lastUpdateBlock = this.actualBlock;
    this.lastState = result.toJSON();
    return result;
  }

  subscribeToEvents(): void {
    this.eventsWatchlist.forEach((eventName) => {
      console.log("subscribing to event", eventName, "on @", this.address);
      this.instance.on(eventName, async (event) => {
        if (event.blockNumber > this.lastUpdateBlock) {
          console.log("received", eventName, "event :", event);
          this.onEvent(eventName, event.args);
        } else {
          console.warn("ignoring past event !");
        }

        if (event.blockNumber > this.lastUpdateBlock + 1) {
          this.lastUpdateBlock = event.blockNumber - 1;
          await this.updateLastBlock();
        }
      });
    });
  }

  onEvent(name: string, args: any[]): void {
    const eventHandlerName = `on${name}Event` as keyof this;
    (this[eventHandlerName] as IEventHandler)(args);
  }

  async syncEvents(fromBlock: number): Promise<void> {
    const eventFilter = this.instance.filters.ContractEvent();
    const missedEvents = await this.instance.queryFilter(
      eventFilter,
      fromBlock
    );

    for (const event of missedEvents) {
      const name = event.event!;
      const args = this.filterArgs(event.args);

      await this.onEvent(name, args);
    }

    this.lastUpdateBlock = this.actualBlock;
    await this.updateLastBlock();
  }

  private async updateLastBlock() {
    await this.model.updateOne(
      { address: this.address },
      { lastUpdateBlock: this.lastUpdateBlock }
    );
  }

  private filterArgs(inputArgs: Record<string, any> | undefined): any[] {
    if (inputArgs === undefined) return [];

    const len = Object.keys(inputArgs).length >> 1;
    const args: any[] = [];
    for (let i = 0; i < len; i++) {
      args.push(inputArgs[`${i}`]);
    }
    return args;
  }
}
