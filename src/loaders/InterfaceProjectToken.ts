import { BigNumber, ethers } from "ethers";
import { contracts } from "../contracts";
import { pubSub } from "../graphql";
import { DateWrapper } from "../models";
import {
  IInterfaceProjectToken,
  InterfaceProjectTokenModel,
} from "../models/InterfaceProjectToken";
import {
  IChargedTokenBalance,
  IChargedTokenClaims,
} from "../models/UserBalances";
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

  async apply(fn: (loader: any) => Promise<void>): Promise<void> {
    await super.apply(fn);
    await this.projectToken?.apply(fn);
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
      valueProjectTokenToFullRecharge: new Map(),
    };
  }

  async loadUserClaims(
    user: string,
    userBalance: IChargedTokenBalance,
    fractionInitialUnlockPerThousand: string,
    durationLinearVesting: string
  ): Promise<IChargedTokenClaims> {
    const timestamp = DateWrapper.now().blockchainTimestamp;

    return {
      balancePT:
        this.projectToken === undefined
          ? "0"
          : await this.projectToken.loadUserBalance(user),
      chargedClaimableProjectToken: this.getValueProjectTokenPerVestingSchedule(
        BigNumber.from(fractionInitialUnlockPerThousand),
        BigNumber.from(userBalance.fullyChargedBalance),
        Math.min(
          timestamp,
          Number(this.lastState!.dateEndCliff) + Number(durationLinearVesting)
        ),
        Number(this.lastState!.dateEndCliff),
        timestamp >= Number(this.lastState!.dateLaunch),
        Number(durationLinearVesting)
      ).toString(),
      claimableProjectToken: this.getValueProjectTokenPerVestingSchedule(
        BigNumber.from(fractionInitialUnlockPerThousand),
        BigNumber.from(userBalance.partiallyChargedBalance),
        Math.min(
          timestamp,
          Number(this.lastState!.dateEndCliff) + Number(durationLinearVesting)
        ),
        Math.max(
          Number(userBalance.dateOfPartiallyCharged),
          Number(this.lastState!.dateEndCliff)
        ),
        false,
        Number(durationLinearVesting)
      ).toString(),
      ptNeededToRecharge: await this.instance.valueProjectTokenToFullRecharge(
        user
      ),
    };
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

  onStartSetEvent([dateLaunch, dateEndCliff]: any[]): void {}
  onProjectTokenReceivedEvent([user, value, fees, hodlRewards]: any[]): void {
    pubSub.publish("UserBalance.load", user);
  }
  onIncreasedValueProjectTokenToFullRechargeEvent([
    user,
    valueIncreased,
  ]: any[]): void {
    pubSub.publish("UserBalance.load", user);
  }
  onLTRechargedEvent([
    user,
    value,
    valueProjectToken,
    hodlRewards,
  ]: any[]): void {
    pubSub.publish("UserBalance.load", user);
  }
  onClaimFeesUpdatedEvent([valuePerThousand]: any[]): void {}
}
