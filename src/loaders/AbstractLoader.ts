import { ethers } from "ethers";

export abstract class AbstractLoader {
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
}
