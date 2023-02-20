import { BigNumber, ethers } from "ethers";
import { contracts } from "../contracts";
import { ChargedTokenModel, IChargedToken } from "../models";
import { IUserBalance } from "../models/UserBalances";
import { EMPTY_ADDRESS } from "../types";
import { AbstractLoader } from "./AbstractLoader";
import { Directory } from "./Directory";
import { InterfaceProjectToken } from "./InterfaceProjectToken";

export class ChargedToken extends AbstractLoader<IChargedToken> {
  interface: InterfaceProjectToken | undefined;
  private readonly directory: Directory;

  constructor(
    chainId: number,
    provider: ethers.providers.JsonRpcProvider,
    address: string,
    directory: Directory
  ) {
    super(
      chainId,
      provider,
      address,
      contracts.LiquidityToken,
      ChargedTokenModel
    );
    this.directory = directory;
  }

  async applyFunc(fn: (loader: any) => Promise<void>): Promise<void> {
    await super.applyFunc(fn);
    await this.interface?.applyFunc(fn);
  }

  async init() {
    await super.init();

    if (this.lastState!.interfaceProjectToken !== EMPTY_ADDRESS) {
      this.interface = new InterfaceProjectToken(
        this.chainId,
        this.provider,
        this.lastState!.interfaceProjectToken,
        this.directory,
        this
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
      chainId: this.chainId,
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
      chainId: this.chainId,
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

  async onTransferEvent([from, to, value]: any[]): Promise<void> {
    if (from !== this.address && to !== this.address) {
      // p2p transfers are not covered by other events
      await this.directory.loadAllUserBalances(from, this.address);
      await this.directory.loadAllUserBalances(to, this.address);
    }
  }

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

  async onInterfaceProjectTokenIsLockedEvent([]: any[]): Promise<void> {
    const jsonModel = await this.getJsonModel();

    jsonModel.isInterfaceProjectTokenLocked = true;

    await this.applyUpdateAndNotify(jsonModel);
  }

  async onIncreasedFullyChargedBalanceEvent([
    user,
    value,
  ]: any[]): Promise<void> {
    await this.directory.loadAllUserBalances(user, this.address);
  }

  async onLTAllocatedByOwnerEvent([
    user,
    value,
    hodlRewards,
    isAllocationStaked,
  ]: any[]): Promise<void> {
    const jsonModel = await this.getJsonModel();

    const bnValue = BigNumber.from(value);

    jsonModel.totalSupply = BigNumber.from(jsonModel.totalSupply)
      .add(bnValue)
      .toString();

    await this.applyUpdateAndNotify(jsonModel);
  }

  async onIncreasedTotalTokenAllocatedEvent([value]: any[]): Promise<void> {
    const jsonModel = await this.getJsonModel();

    jsonModel.totalTokenAllocated = BigNumber.from(
      jsonModel.totalTokenAllocated
    )
      .add(BigNumber.from(value))
      .toString();

    await this.applyUpdateAndNotify(jsonModel);
  }

  async onIncreasedStakedLTEvent([value]: any[]): Promise<void> {
    const jsonModel = await this.getJsonModel();

    jsonModel.stakedLT = BigNumber.from(jsonModel.stakedLT)
      .add(BigNumber.from(value))
      .toString();

    await this.applyUpdateAndNotify(jsonModel);
  }

  async onAllocationsAreTerminatedEvent([]: any[]): Promise<void> {
    const jsonModel = await this.getJsonModel();

    jsonModel.areAllocationsTerminated = true;

    await this.applyUpdateAndNotify(jsonModel);
  }

  async onDecreasedFullyChargedBalanceAndStakedLTEvent([
    user,
    value,
  ]: any[]): Promise<void> {
    // user balances are loaded by LTReceivedEvent

    const jsonModel = await this.getJsonModel();

    jsonModel.stakedLT = BigNumber.from(jsonModel.stakedLT)
      .sub(BigNumber.from(value))
      .toString();

    await this.applyUpdateAndNotify(jsonModel);
  }

  async onLTReceivedEvent([
    user,
    value,
    totalFees,
    feesToRewardHodlers,
    hodlRewards,
  ]: any[]): Promise<void> {
    await this.directory.loadAllUserBalances(user, this.address);
  }

  async onClaimedRewardPerShareUpdatedEvent([
    user,
    value,
  ]: any[]): Promise<void> {}

  async onCurrentRewardPerShareAndStakingCheckpointUpdatedEvent([
    rewardPerShare1e18,
    blockTime,
  ]: any[]): Promise<void> {
    // user rewards updated by ClaimedRewardPerShareUpdatedEvent

    const jsonModel = await this.getJsonModel();

    jsonModel.currentRewardPerShare1e18 = rewardPerShare1e18;
    jsonModel.stakingDateLastCheckpoint = blockTime;

    await this.applyUpdateAndNotify(jsonModel);
  }

  async onIncreasedCurrentRewardPerShareEvent([value]: any[]): Promise<void> {
    const jsonModel = await this.getJsonModel();

    jsonModel.currentRewardPerShare1e18 = BigNumber.from(
      jsonModel.currentRewardPerShare1e18
    )
      .add(BigNumber.from(value))
      .toString();

    await this.applyUpdateAndNotify(jsonModel);
  }

  async onLTDepositedEvent([user, value, hodlRewards]: any[]): Promise<void> {
    // user balances updated by IncreasedFullyChargedBalance
  }

  async onStakingCampaignCreatedEvent([
    startDate,
    duration,
    rewards,
  ]: any[]): Promise<void> {
    const jsonModel = await this.getJsonModel();

    const bnRewards = BigNumber.from(rewards);

    jsonModel.stakingStartDate = startDate;
    jsonModel.stakingDateLastCheckpoint = startDate;
    jsonModel.stakingDuration = duration;
    jsonModel.campaignStakingRewards = rewards.toString();
    jsonModel.totalStakingRewards = BigNumber.from(
      jsonModel.totalStakingRewards
    )
      .add(bnRewards)
      .toString();
    jsonModel.totalTokenAllocated = BigNumber.from(
      jsonModel.totalTokenAllocated
    )
      .add(bnRewards)
      .toString();
    jsonModel.totalSupply = BigNumber.from(jsonModel.totalSupply)
      .add(bnRewards)
      .toString();

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
    // partiallyChargedBalance updated by IncreaseFullyChargedBalanceEvent
  }

  async onUpdatedDateOfPartiallyChargedAndDecreasedStakedLTEvent([
    blockTime,
    value,
  ]: any[]): Promise<void> {
    // dateOfPartiallyCharged updated by TokensDischargedEvent
    const jsonModel = await this.getJsonModel();

    jsonModel.stakedLT = BigNumber.from(jsonModel.stakedLT)
      .sub(BigNumber.from(value))
      .toString();

    await this.applyUpdateAndNotify(jsonModel);
  }

  async onTokensDischargedEvent([
    user,
    partiallyChargedBalance,
  ]: any[]): Promise<void> {
    await this.directory.loadAllUserBalances(user, this.address);
  }
}
