import { BigNumber, ethers } from "ethers";
import { contracts } from "../contracts";
import { pubSub } from "../graphql";
import {
  IInterfaceProjectToken,
  InterfaceProjectTokenModel,
} from "../models/InterfaceProjectToken";
import { EMPTY_ADDRESS } from "../types";
import { AbstractLoader } from "./AbstractLoader";
import { DelegableToLT } from "./DelegableToLT";

export class InterfaceProjectToken extends AbstractLoader<IInterfaceProjectToken> {
  projectToken: DelegableToLT | undefined;

  constructor(provider: ethers.providers.JsonRpcProvider, address: string) {
    super(
      provider,
      address,
      contracts.InterfaceProjectToken,
      InterfaceProjectTokenModel
    );
  }

  async applyFunc(fn: (loader: any) => Promise<void>): Promise<void> {
    await super.applyFunc(fn);
    await this.projectToken?.applyFunc(fn);
  }

  async init() {
    await super.init();

    if (this.lastState!.projectToken !== EMPTY_ADDRESS) {
      this.projectToken = new DelegableToLT(
        this.provider,
        this.lastState!.projectToken
      );

      await this.projectToken.init();
    }
  }

  toModel(data: IInterfaceProjectToken) {
    return (InterfaceProjectTokenModel as any).toModel(data);
  }

  async load() {
    console.log("Reading interface project token @", this.address);

    const ins = this.instance;

    return {
      // contract
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
      valueProjectTokenToFullRecharge: {},
    };
  }

  async loadUserBalancePT(user: string): Promise<string> {
    console.log("Loading user PT balance for", user);

    return this.projectToken === undefined
      ? "0"
      : await this.projectToken.loadUserBalance(user);
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
    pubSub.publish("UserBalance/load", user);
  }

  async onIncreasedValueProjectTokenToFullRechargeEvent([
    user,
    valueIncreased,
  ]: any[]): Promise<void> {
    pubSub.publish("UserBalance/load", user);
  }

  async onLTRechargedEvent([
    user,
    value,
    valueProjectToken,
    hodlRewards,
  ]: any[]): Promise<void> {
    pubSub.publish("UserBalance/load", user);
  }

  async onClaimFeesUpdatedEvent([valuePerThousand]: any[]): Promise<void> {
    const jsonModel = await this.getJsonModel();

    jsonModel.claimFeesPerThousandForPT = valuePerThousand.toString();

    await this.applyUpdateAndNotify(jsonModel);
  }
}
