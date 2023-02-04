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

  async apply(fn: (loader: any) => Promise<void>): Promise<void> {
    await super.apply(fn);
    await this.interface?.apply(fn);
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
      claimedRewardPerShare1e18: new Map(),
      userLiquiToken: new Map(),
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

  onTransferEvent([from, to, value]: any[]): void {}

  onUserFunctionsAreDisabledEvent([areUserFunctionsDisabled]: any[]): void {}
  onInterfaceProjectTokenSetEvent([interfaceProjectToken]: any[]): void {}
  onInterfaceProjectTokenIsLockedEvent([]: any[]): void {}
  onIncreasedFullyChargedBalanceEvent([user, value]: any[]): void {
    pubSub.publish("UserBalance/load", user);
  }
  onLTAllocatedByOwnerEvent([
    user,
    value,
    hodlRewards,
    isAllocationStaked,
  ]: any[]): void {
    pubSub.publish("UserBalance/load", user);
  }
  onIncreasedTotalTokenAllocatedEvent([value]: any[]): void {}
  onIncreasedStakedLTEvent([value]: any[]): void {}
  onAllocationsAreTerminatedEvent([]: any[]): void {}
  onDecreasedFullyChargedBalanceAndStakedLTEvent([user, value]: any[]): void {
    pubSub.publish("UserBalance/load", user);
  }
  onLTReceivedEvent([
    user,
    value,
    totalFees,
    feesToRewardHodlers,
    hodlRewards,
  ]: any[]): void {
    pubSub.publish("UserBalance/load", user);
  }
  onClaimedRewardPerShareUpdatedEvent([user, value]: any[]): void {
    pubSub.publish("UserBalance/load", user);
  }
  onCurrentRewardPerShareAndStakingCheckpointUpdatedEvent([
    rewardPerShare1e18,
    blockTime,
  ]: any[]): void {}
  onIncreasedCurrentRewardPerShareEvent([value]: any[]): void {}
  onLTDepositedEvent([user, value, hodlRewards]: any[]): void {
    pubSub.publish("UserBalance/load", user);
  }
  onStakingCampaignCreatedEvent([startDate, duration, rewards]: any[]): void {}
  onWithdrawalFeesUpdatedEvent([value]: any[]): void {}
  onRatioFeesToRewardHodlersUpdatedEvent([value]: any[]): void {}
  onDecreasedPartiallyChargedBalanceEvent([user, value]: any[]): void {
    pubSub.publish("UserBalance/load", user);
  }
  onUpdatedDateOfPartiallyChargedAndDecreasedStakedLTEvent([
    blockTime,
    value,
  ]: any[]): void {}
  onTokensDischargedEvent([user, partiallyChargedBalance]: any[]): void {
    pubSub.publish("UserBalance/load", user);
  }
}
