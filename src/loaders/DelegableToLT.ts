import { ethers } from "ethers";
import { contracts } from "../contracts";
import { DelegableToLTModel, IDelegableToLT } from "../models/DelegableToLT";
import { AbstractLoader } from "./AbstractLoader";
import { ChargedToken } from "./ChargedToken";
import { Directory } from "./Directory";

export class DelegableToLT extends AbstractLoader<IDelegableToLT> {
  readonly ct: ChargedToken;
  readonly directory: Directory;

  constructor(
    provider: ethers.providers.JsonRpcProvider,
    address: string,
    directory: Directory,
    ct: ChargedToken
  ) {
    super(provider, address, contracts.DelegableToLT, DelegableToLTModel);

    this.directory = directory;
    this.ct = ct;
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

  async onTransferEvent([from, to, value]: any[]): Promise<void> {
    if (from !== this.address && to !== this.address) {
      await this.directory.loadAllUserBalances(from, this.ct.address);
      await this.directory.loadAllUserBalances(to, this.ct.address);
    }
  }

  async onAddedAllTimeValidatedInterfaceProjectTokenEvent([
    interfaceProjectToken,
  ]: any[]): Promise<void> {}

  async onAddedInterfaceProjectTokenEvent([
    interfaceProjectToken,
  ]: any[]): Promise<void> {
    const jsonModel = await this.getJsonModel();

    jsonModel.validatedInterfaceProjectToken.push(interfaceProjectToken);

    await this.applyUpdateAndNotify(jsonModel);
  }

  async onListOfValidatedInterfaceProjectTokenIsFinalizedEvent([]: any[]): Promise<void> {
    const jsonModel = await this.getJsonModel();

    jsonModel.isListOfInterfaceProjectTokenComplete = true;

    await this.applyUpdateAndNotify(jsonModel);
  }

  async onInterfaceProjectTokenRemovedEvent([
    interfaceProjectToken,
  ]: any[]): Promise<void> {
    const jsonModel = await this.getJsonModel();

    jsonModel.validatedInterfaceProjectToken =
      jsonModel.validatedInterfaceProjectToken.filter(
        (address) => address !== interfaceProjectToken
      );

    await this.applyUpdateAndNotify(jsonModel);
  }
}
