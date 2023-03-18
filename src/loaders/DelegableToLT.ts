import { BigNumber, ethers } from "ethers";
import { HydratedDocument } from "mongoose";
import { contracts } from "../contracts";
import { pubSub } from "../graphql";
import { IUserBalance, UserBalanceModel } from "../models";
import { DelegableToLTModel, IDelegableToLT } from "../models/DelegableToLT";
import { EMPTY_ADDRESS } from "../types";
import { AbstractLoader } from "./AbstractLoader";
import { ChargedToken } from "./ChargedToken";
import { Directory } from "./Directory";

export class DelegableToLT extends AbstractLoader<IDelegableToLT> {
  readonly ct: ChargedToken;
  readonly directory: Directory;

  constructor(
    chainId: number,
    provider: ethers.providers.JsonRpcProvider,
    address: string,
    directory: Directory,
    ct: ChargedToken
  ) {
    super(
      chainId,
      provider,
      address,
      contracts.DelegableToLT,
      DelegableToLTModel
    );

    this.directory = directory;
    this.ct = ct;
  }

  toModel(data: IDelegableToLT) {
    return (DelegableToLTModel as any).toModel(data);
  }

  async load() {
    console.log(this.chainId, "Reading project token @", this.address);

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
      chainId: this.chainId,
      initBlock:
        this.lastState !== undefined
          ? this.lastState.initBlock
          : this.actualBlock,
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
    return (await this.instance.balanceOf(user)).toString();
  }

  async onTransferEvent([from, to, value]: any[]): Promise<void> {
    if (from !== EMPTY_ADDRESS) {
      // p2p transfers are not covered by other events
      const oldBalance = await UserBalanceModel.findOne({
        address: this.address,
        user: from,
      });

      if (oldBalance !== null) {
        const balancePT = BigNumber.from(oldBalance.balancePT)
          .sub(BigNumber.from(value))
          .toString();

        await UserBalanceModel.updateOne(
          { address: this.address, user: from },
          { balancePT }
        );

        const newBalance = (await UserBalanceModel.findOne({
          address: this.address,
          user: from,
        })) as HydratedDocument<IUserBalance>;

        pubSub.publish(`UserBalance.${this.chainId}.${newBalance.user}`, [
          JSON.stringify(UserBalanceModel.toGraphQL(newBalance)),
        ]);
      }
    }
    if (to !== EMPTY_ADDRESS) {
      // p2p transfers are not covered by other events
      const oldBalance = await UserBalanceModel.findOne({
        address: this.address,
        user: to,
      });

      if (oldBalance !== null) {
        const balancePT = BigNumber.from(oldBalance.balancePT)
          .add(BigNumber.from(value))
          .toString();

        await UserBalanceModel.updateOne(
          { address: this.address, user: to },
          { balancePT }
        );

        const newBalance = (await UserBalanceModel.findOne({
          address: this.address,
          user: to,
        })) as HydratedDocument<IUserBalance>;

        pubSub.publish(`UserBalance.${this.chainId}.${newBalance.user}`, [
          JSON.stringify(UserBalanceModel.toGraphQL(newBalance)),
        ]);
      }
    }
    if (from === EMPTY_ADDRESS) {
      const jsonModel = await this.getJsonModel();
      jsonModel.totalSupply = BigNumber.from(jsonModel.totalSupply)
        .add(BigNumber.from(value))
        .toString();
      await this.applyUpdateAndNotify(jsonModel);
    }
    if (to === EMPTY_ADDRESS) {
      const jsonModel = await this.getJsonModel();
      jsonModel.totalSupply = BigNumber.from(jsonModel.totalSupply)
        .sub(BigNumber.from(value))
        .toString();
      await this.applyUpdateAndNotify(jsonModel);
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
