import { ethers } from "ethers";
import { FlattenMaps, HydratedDocument } from "mongoose";
import { IContract } from "../types";

export abstract class AbstractLoader<T extends IContract> {
  protected readonly provider: ethers.providers.JsonRpcProvider;
  protected readonly address: string;
  protected readonly contract: any;
  protected readonly instance: ethers.Contract;
  protected lastUpdateBlock: number = 0;
  protected actualBlock: number = 0;
  protected lastState: FlattenMaps<T> | undefined;

  protected constructor(
    provider: ethers.providers.JsonRpcProvider,
    address: string,
    contract: any
  ) {
    this.provider = provider;
    this.address = address;
    this.contract = contract;

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
  }

  abstract load(): Promise<T>;

  abstract get(): Promise<HydratedDocument<T> | null>;

  abstract saveOrUpdate(data: T): Promise<HydratedDocument<T>>;

  abstract toModel(data: T): HydratedDocument<T>;

  abstract syncEvents(fromBlock: number): Promise<void>;

  abstract subscribeToEvents(): void;
}
