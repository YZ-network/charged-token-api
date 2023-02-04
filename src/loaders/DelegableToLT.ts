import { ethers } from "ethers";
import { contracts } from "../contracts";
import { pubSub } from "../graphql";
import { DelegableToLTModel, IDelegableToLT } from "../models/DelegableToLT";
import { AbstractLoader } from "./AbstractLoader";

export class DelegableToLT extends AbstractLoader<IDelegableToLT> {
  constructor(provider: ethers.providers.JsonRpcProvider, address: string) {
    super(provider, address, contracts.DelegableToLT, DelegableToLTModel);
  }

  toModel(data: IDelegableToLT) {
    return (DelegableToLTModel as any).toModel(data);
  }

  async load() {
    console.log("Reading project token @", this.address);

    const ins = this.instance;

    const validatedInterfaceProjectToken: string[] = [];
    const validatedInterfaceCount = (
      await ins.countValidatedInterfaceProjectToken()
    ).toNumber();
    for (let i = 0; i < validatedInterfaceCount; i++) {
      validatedInterfaceProjectToken.push(
        await ins.getValidatedInterfaceProjectToken(i)
      );
    }

    return {
      // contract
      lastUpdateBlock: this.actualBlock,
      address: this.address,
      // ownable
      owner: await ins.owner(),
      // erc20
      name: await ins.name(),
      symbol: await ins.symbol(),
      decimals: (await ins.decimals()).toString(),
      balances: {},
      totalSupply: await ins.totalSupply(),
      // other
      validatedInterfaceProjectToken,
      isListOfInterfaceProjectTokenComplete:
        await ins.isListOfInterfaceProjectTokenComplete(),
    };
  }

  async loadUserBalance(user: string) {
    return await this.instance.balanceOf(user);
  }

  onTransferEvent([from, to, value]: any[]): void {
    pubSub.publish("UserBalance.load", from);
    pubSub.publish("UserBalance.load", to);
  }

  onAddedAllTimeValidatedInterfaceProjectTokenEvent([
    interfaceProjectToken,
  ]: any[]): void {}
  onAddedInterfaceProjectTokenEvent([interfaceProjectToken]: any[]): void {}
  onListOfValidatedInterfaceProjectTokenIsFinalizedEvent([]: any[]): void {}
  onInterfaceProjectTokenRemovedEvent([interfaceProjectToken]: any[]): void {}
}
