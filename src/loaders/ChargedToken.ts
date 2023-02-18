import { ethers } from "ethers";
import { contracts } from "../contracts";
import { pubSub } from "../graphql";
import { ChargedTokenModel, IChargedToken } from "../models";
import { IUserBalance } from "../models/UserBalances";
import { EMPTY_ADDRESS } from "../types";
import { AbstractLoader } from "./AbstractLoader";
import { InterfaceProjectToken } from "./InterfaceProjectToken";

export class ChargedToken extends AbstractLoader<IChargedToken> {
  interface: InterfaceProjectToken | undefined;

  constructor(provider: ethers.providers.JsonRpcProvider, address: string) {
    super(provider, address, contracts.LiquidityToken, ChargedTokenModel);
  }

  async applyFunc(fn: (loader: any) => Promise<void>): Promise<void> {
    await super.applyFunc(fn);
    await this.interface?.applyFunc(fn);
  }

  async init() {
    await super.init();

    if (this.lastState!.interfaceProjectToken !== EMPTY_ADDRESS) {
      this.interface = new InterfaceProjectToken(
        this.provider,
        this.lastState!.interfaceProjectToken
      );

      await this.interface.init();
    }
  }

  toModel(data: IChargedToken) {
    return (ChargedTokenModel as any).toModel(data);
  }

  async load() {
    console.log("Reading charged token @", this.address);

    const ins = this.instance;

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
      // constants
      fractionInitialUnlockPerThousand: (
        await ins.fractionInitialUnlockPerThousand()
      ).toString(),
      durationCliff: (await ins.durationCliff()).toString(),
      durationLinearVesting: (await ins.durationLinearVesting()).toString(),
      maxInitialTokenAllocation: (
        await ins.maxInitialTokenAllocation()
      ).toString(),
      maxWithdrawFeesPerThousandForLT: (
        await ins.maxWithdrawFeesPerThousandForLT()
      ).toString(),
      maxClaimFeesPerThousandForPT: (
        await ins.maxClaimFeesPerThousandForPT()
      ).toString(),
      maxStakingAPR: (await ins.maxStakingAPR()).toString(),
      maxStakingTokenAmount: (await ins.maxStakingTokenAmount()).toString(),
      // toggles
      areUserFunctionsDisabled: await ins.areUserFunctionsDisabled(),
      isInterfaceProjectTokenLocked: await ins.isInterfaceProjectTokenLocked(),
      areAllocationsTerminated: await ins.areAllocationsTerminated(),
      // variables
      interfaceProjectToken: await ins.interfaceProjectToken(),
      ratioFeesToRewardHodlersPerThousand: (
        await ins.ratioFeesToRewardHodlersPerThousand()
      ).toString(),
      currentRewardPerShare1e18: (
        await ins.currentRewardPerShare1e18()
      ).toString(),
      stakedLT: (await ins.stakedLT()).toString(),
      totalTokenAllocated: (await ins.totalTokenAllocated()).toString(),
      withdrawFeesPerThousandForLT: (
        await ins.withdrawFeesPerThousandForLT()
      ).toString(),
      // maps
      claimedRewardPerShare1e18: {},
      userLiquiToken: {},
      // staking
      stakingStartDate: (await ins.stakingStartDate()).toString(),
      stakingDuration: (await ins.stakingDuration()).toString(),
      stakingDateLastCheckpoint: (
        await ins.stakingDateLastCheckpoint()
      ).toString(),
      campaignStakingRewards: (await ins.campaignStakingRewards()).toString(),
      totalStakingRewards: (await ins.totalStakingRewards()).toString(),
    };
  }

  async loadUserBalances(user: string): Promise<IUserBalance> {
    console.log("Loading CT balances for", user, this.address);

    return {
      user,
      address: this.address,
      lastUpdateBlock: this.actualBlock,
      balance: await this.instance.balanceOf(user),
      balancePT:
        this.interface !== undefined
          ? await this.interface.loadUserBalancePT(user)
          : "0",
      fullyChargedBalance:
        await this.instance.getUserFullyChargedBalanceLiquiToken(user),
      partiallyChargedBalance:
        await this.instance.getUserPartiallyChargedBalanceLiquiToken(user),
      dateOfPartiallyCharged:
        await this.instance.getUserDateOfPartiallyChargedToken(user),
    };
  }

  async onTransferEvent([from, to, value]: any[]): Promise<void> {}

  async onUserFunctionsAreDisabledEvent([
    areUserFunctionsDisabled,
  ]: any[]): Promise<void> {
    const jsonModel = await this.getJsonModel();

    jsonModel.areUserFunctionsDisabled = areUserFunctionsDisabled;

    await this.applyUpdateAndNotify(jsonModel);
  }

  async onInterfaceProjectTokenSetEvent([
    interfaceProjectToken,
  ]: any[]): Promise<void> {
    const jsonModel = await this.getJsonModel();

    jsonModel.interfaceProjectToken = interfaceProjectToken;

    await this.applyUpdateAndNotify(jsonModel);
  }

  async onInterfaceProjectTokenIsLockedEvent([]: any[]): Promise<void> {}

  async onIncreasedFullyChargedBalanceEvent([
    user,
    value,
  ]: any[]): Promise<void> {
    pubSub.publish("UserBalance/load", user);
  }

  async onLTAllocatedByOwnerEvent([
    user,
    value,
    hodlRewards,
    isAllocationStaked,
  ]: any[]): Promise<void> {
    pubSub.publish("UserBalance/load", user);
  }

  async onIncreasedTotalTokenAllocatedEvent([value]: any[]): Promise<void> {
    const jsonModel = await this.getJsonModel();

    jsonModel.totalTokenAllocated = value.toString();

    await this.applyUpdateAndNotify(jsonModel);
  }

  async onIncreasedStakedLTEvent([value]: any[]): Promise<void> {
    const jsonModel = await this.getJsonModel();

    jsonModel.stakedLT = value.toString();

    await this.applyUpdateAndNotify(jsonModel);
  }

  async onAllocationsAreTerminatedEvent([]: any[]): Promise<void> {}

  async onDecreasedFullyChargedBalanceAndStakedLTEvent([
    user,
    value,
  ]: any[]): Promise<void> {
    pubSub.publish("UserBalance/load", user);
  }

  async onLTReceivedEvent([
    user,
    value,
    totalFees,
    feesToRewardHodlers,
    hodlRewards,
  ]: any[]): Promise<void> {
    pubSub.publish("UserBalance/load", user);
  }

  async onClaimedRewardPerShareUpdatedEvent([
    user,
    value,
  ]: any[]): Promise<void> {
    pubSub.publish("UserBalance/load", user);
  }

  async onCurrentRewardPerShareAndStakingCheckpointUpdatedEvent([
    rewardPerShare1e18,
    blockTime,
  ]: any[]): Promise<void> {}

  async onIncreasedCurrentRewardPerShareEvent([value]: any[]): Promise<void> {
    const jsonModel = await this.getJsonModel();

    jsonModel.currentRewardPerShare1e18 = value.toString();

    await this.applyUpdateAndNotify(jsonModel);
  }

  async onLTDepositedEvent([user, value, hodlRewards]: any[]): Promise<void> {
    pubSub.publish("UserBalance/load", user);
  }

  async onStakingCampaignCreatedEvent([
    startDate,
    duration,
    rewards,
  ]: any[]): Promise<void> {
    const jsonModel = await this.getJsonModel();

    jsonModel.stakingStartDate = startDate;
    jsonModel.stakingDuration = duration;
    jsonModel.campaignStakingRewards = rewards.toString();

    await this.applyUpdateAndNotify(jsonModel);
  }

  async onWithdrawalFeesUpdatedEvent([value]: any[]): Promise<void> {
    const jsonModel = await this.getJsonModel();

    jsonModel.withdrawFeesPerThousandForLT = value.toString();

    await this.applyUpdateAndNotify(jsonModel);
  }

  async onRatioFeesToRewardHodlersUpdatedEvent([value]: any[]): Promise<void> {
    const jsonModel = await this.getJsonModel();

    jsonModel.ratioFeesToRewardHodlersPerThousand = value.toString();

    await this.applyUpdateAndNotify(jsonModel);
  }

  async onDecreasedPartiallyChargedBalanceEvent([
    user,
    value,
  ]: any[]): Promise<void> {
    pubSub.publish("UserBalance/load", user);
  }

  async onUpdatedDateOfPartiallyChargedAndDecreasedStakedLTEvent([
    blockTime,
    value,
  ]: any[]): Promise<void> {}

  async onTokensDischargedEvent([
    user,
    partiallyChargedBalance,
  ]: any[]): Promise<void> {
    pubSub.publish("UserBalance/load", user);
  }
}
