import { ethers } from "ethers";
import { HydratedDocument } from "mongoose";

export abstract class AbstractLoader<T> {
  protected readonly provider: ethers.providers.JsonRpcProvider;
  protected readonly address: string;
  protected readonly contract: any;
  protected readonly instance: ethers.Contract;

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

  abstract load(): Promise<T>;

  abstract saveOrUpdate(data: T): Promise<void>;

  abstract toModel(data: T): HydratedDocument<T>;

  subscribeToEvents() {
    // this.instance.
  }
}
