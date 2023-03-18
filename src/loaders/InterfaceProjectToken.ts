import { BigNumber, ethers } from "ethers";
import { HydratedDocument } from "mongoose";
import { contracts } from "../contracts";
import { pubSub } from "../graphql";
import { IUserBalance, UserBalanceModel } from "../models";
import {
  IInterfaceProjectToken,
  InterfaceProjectTokenModel,
} from "../models/InterfaceProjectToken";
import { AbstractLoader } from "./AbstractLoader";
import { ChargedToken } from "./ChargedToken";
import { DelegableToLT } from "./DelegableToLT";
import { Directory } from "./Directory";

export class InterfaceProjectToken extends AbstractLoader<IInterfaceProjectToken> {
  projectToken: DelegableToLT | undefined;
  readonly directory: Directory;
  readonly ct: ChargedToken;

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
      contracts.InterfaceProjectToken,
      InterfaceProjectTokenModel
    );
    this.directory = directory;
    this.ct = ct;
  }

  async applyFunc(fn: (loader: any) => Promise<void>): Promise<void> {
    await super.applyFunc(fn);
    await this.projectToken?.applyFunc(fn);
  }

  async init(actualBlock?: number) {
    await super.init(actualBlock);

    this.projectToken = new DelegableToLT(
      this.chainId,
      this.provider,
      this.lastState!.projectToken,
      this.directory,
      this.ct
    );

    await this.projectToken.init(actualBlock);
  }

  toModel(data: IInterfaceProjectToken) {
    return (InterfaceProjectTokenModel as any).toModel(data);
  }

  async load() {
    console.log(
      this.chainId,
      "Reading interface project token @",
      this.address
    );

    const ins = this.instance;

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
      // other
      liquidityToken: await ins.liquidityToken(),
      projectToken: await ins.projectToken(),
      dateLaunch: (await ins.dateLaunch()).toString(),
      dateEndCliff: (await ins.dateEndCliff()).toString(),
      claimFeesPerThousandForPT: (
        await ins.claimFeesPerThousandForPT()
      ).toString(),
    };
  }

  async loadUserBalancePT(user: string): Promise<string> {
    console.log("Loading user PT balance for", user);

    return this.projectToken === undefined
      ? "0"
      : await this.projectToken.loadUserBalance(user);
  }

  async loadValueProjectTokenToFullRecharge(user: string): Promise<string> {
    return (
      await this.instance.valueProjectTokenToFullRecharge(user)
    ).toString();
  }

  private getValueProjectTokenPerVestingSchedule(
    fractionInitialUnlockPerThousand: BigNumber,
    balance: BigNumber,
    timestamp: number,
    dateStart: number,
    addInitialUnlock: boolean,
    durationLinearVesting: number
  ): BigNumber {
    let valueProjectToken = BigNumber.from(0);

    if (addInitialUnlock)
      valueProjectToken = balance
        .mul(fractionInitialUnlockPerThousand)
        .div(1000);

    if (timestamp > dateStart) {
      valueProjectToken = valueProjectToken.add(
        balance
          .mul(BigNumber.from(1000).sub(fractionInitialUnlockPerThousand))
          .mul(BigNumber.from(timestamp - dateStart))
          .div(BigNumber.from(1000).mul(BigNumber.from(durationLinearVesting)))
      );
    }

    return valueProjectToken;
  }

  subscribeToEvents(): void {
    super.subscribeToEvents();
    this.projectToken!.subscribeToEvents();
  }

  unsubscribeEvents(): void {
    super.unsubscribeEvents();
    this.projectToken!.unsubscribeEvents();
  }

  async onStartSetEvent([dateLaunch, dateEndCliff]: any[]): Promise<void> {
    const jsonModel = await this.getJsonModel();

    jsonModel.dateLaunch = dateLaunch;
    jsonModel.dateEndCliff = dateEndCliff;

    await this.applyUpdateAndNotify(jsonModel);
  }

  async onProjectTokenReceivedEvent([
    user,
    value,
    fees,
    hodlRewards,
  ]: any[]): Promise<void> {
    // user balances & totalSupply updated by TransferEvents
  }

  async onIncreasedValueProjectTokenToFullRechargeEvent([
    user,
    valueIncreased,
  ]: any[]): Promise<void> {
    const oldBalance = await UserBalanceModel.findOne({
      address: this.address,
      user,
    });

    if (oldBalance !== null) {
      const valueProjectTokenToFullRecharge = BigNumber.from(
        oldBalance.valueProjectTokenToFullRecharge
      )
        .add(BigNumber.from(valueIncreased))
        .toString();

      await UserBalanceModel.updateOne(
        { address: this.address, user },
        { valueProjectTokenToFullRecharge }
      );

      const newBalance = (await UserBalanceModel.findOne({
        address: this.address,
        user,
      })) as HydratedDocument<IUserBalance>;

      pubSub.publish(`UserBalance.${this.chainId}.${newBalance.user}`, [
        JSON.stringify(UserBalanceModel.toGraphQL(newBalance)),
      ]);
    }
  }

  async onLTRechargedEvent([
    user,
    value,
    valueProjectToken,
    hodlRewards,
  ]: any[]): Promise<void> {
    const oldBalance = await UserBalanceModel.findOne({
      address: this.address,
      user,
    });

    if (oldBalance !== null) {
      const valueProjectTokenToFullRecharge = BigNumber.from(
        oldBalance.valueProjectTokenToFullRecharge
      )
        .sub(BigNumber.from(valueProjectToken))
        .toString();

      await UserBalanceModel.updateOne(
        { address: this.address, user },
        { valueProjectTokenToFullRecharge }
      );

      const newBalance = (await UserBalanceModel.findOne({
        address: this.address,
        user,
      })) as HydratedDocument<IUserBalance>;

      pubSub.publish(`UserBalance.${this.chainId}.${newBalance.user}`, [
        JSON.stringify(UserBalanceModel.toGraphQL(newBalance)),
      ]);
    }
  }

  async onClaimFeesUpdatedEvent([valuePerThousand]: any[]): Promise<void> {
    const jsonModel = await this.getJsonModel();

    jsonModel.claimFeesPerThousandForPT = valuePerThousand.toString();

    await this.applyUpdateAndNotify(jsonModel);
  }
}
