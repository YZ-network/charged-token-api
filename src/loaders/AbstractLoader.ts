import { ethers } from "ethers";
import { FlattenMaps, HydratedDocument } from "mongoose";
import { IContract, IEventHandler } from "../types";

export abstract class AbstractLoader<T extends IContract> {
  protected readonly provider: ethers.providers.JsonRpcProvider;
  protected readonly address: string;
  protected readonly contract: any;
  protected readonly eventsWatchlist: string[];
  protected readonly instance: ethers.Contract;
  protected lastUpdateBlock: number = 0;
  protected actualBlock: number = 0;
  protected lastState: FlattenMaps<T> | undefined;

  protected constructor(
    provider: ethers.providers.JsonRpcProvider,
    address: string,
    contract: any,
    eventsWatchlist: string[] = []
  ) {
    this.provider = provider;
    this.address = address;
    this.contract = contract;
    this.eventsWatchlist = eventsWatchlist;

    this.instance = new ethers.Contract(address, contract.abi, provider);
  }

  async init(): Promise<void> {
    this.actualBlock = await this.provider.getBlockNumber();

    const existing = await this.get();

    if (existing != null) {
      this.lastUpdateBlock = existing.lastUpdateBlock;
      this.lastState = existing.toJSON();
    }

    if (this.lastUpdateBlock === 0) {
      await this.saveOrUpdate(await this.load());
    } else {
      await this.syncEvents(this.lastUpdateBlock);
    }

    this.subscribeToEvents();
  }

  abstract load(): Promise<T>;

  abstract get(): Promise<HydratedDocument<T> | null>;

  abstract saveOrUpdate(data: T): Promise<HydratedDocument<T>>;

  abstract toModel(data: T): HydratedDocument<T>;

  subscribeToEvents(): void {
    this.eventsWatchlist.forEach((eventName) => {
      this.instance.on(eventName, (...args) => {
        console.log("received", name, "event :", ...args);
        this.onEvent(eventName, args);
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
