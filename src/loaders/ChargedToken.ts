import { BigNumber, ethers } from "ethers";
import { HydratedDocument } from "mongoose";
import { contracts } from "../contracts";
import { pubSub } from "../graphql";
import { ChargedTokenModel, IChargedToken } from "../models";
import { IUserBalance, UserBalanceModel } from "../models/UserBalances";
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

  async init(actualBlock?: number) {
    await super.init(actualBlock);

    if (this.lastState!.interfaceProjectToken !== EMPTY_ADDRESS) {
      this.interface = new InterfaceProjectToken(
        this.chainId,
        this.provider,
        this.lastState!.interfaceProjectToken,
        this.directory,
        this
      );

      await this.interface.init(actualBlock);
    }
  }

  toModel(data: IChargedToken) {
    return (ChargedTokenModel as any).toModel(data);
  }

  async load() {
    console.log(this.chainId, "Reading charged token @", this.address);

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

    const balance = (await this.instance.balanceOf(user)).toString();
    const fullyChargedBalance = (
      await this.instance.getUserFullyChargedBalanceLiquiToken(user)
    ).toString();
    const partiallyChargedBalance = (
      await this.instance.getUserPartiallyChargedBalanceLiquiToken(user)
    ).toString();

    console.log(
      "Loaded balances for user",
      user,
      "@ CT",
      this.address,
      ":",
      balance,
      fullyChargedBalance,
      partiallyChargedBalance
    );

    return {
      chainId: this.chainId,
      user,
      address: this.address,
      lastUpdateBlock: this.actualBlock,
      balance,
      balancePT:
        this.interface !== undefined
          ? await this.interface.loadUserBalancePT(user)
          : "0",
      fullyChargedBalance,
      partiallyChargedBalance,
      dateOfPartiallyCharged:
        await this.instance.getUserDateOfPartiallyChargedToken(user),
      claimedRewardPerShare1e18: (
        await this.instance.claimedRewardPerShare1e18(user)
      ).toString(),
      valueProjectTokenToFullRecharge:
        this.interface !== undefined
          ? await this.interface.loadValueProjectTokenToFullRecharge(user)
          : "0",
    };
  }

  subscribeToEvents(): void {
    super.subscribeToEvents();
    if (this.interface !== undefined) {
      this.interface.subscribeToEvents();
    }
  }

  unsubscribeEvents(): void {
    super.unsubscribeEvents();
    if (this.interface !== undefined) {
      this.interface.unsubscribeEvents();
    }
  }

  async onTransferEvent([from, to, value]: any[]): Promise<void> {
    if (from !== EMPTY_ADDRESS) {
      const balanceFrom = await UserBalanceModel.findOne({
        address: this.address,
        user: from,
      });

      if (balanceFrom !== null) {
        const updatedBalance = BigNumber.from(balanceFrom.balance)
          .sub(BigNumber.from(value))
          .toString();

        await UserBalanceModel.updateOne(
          { address: this.address, user: from },
          { balance: updatedBalance }
        );

        const newBalanceFrom = (await UserBalanceModel.findOne({
          address: this.address,
          user: from,
        })) as HydratedDocument<IUserBalance>;

        pubSub.publish(`UserBalance.${this.chainId}.${newBalanceFrom.user}`, [
          JSON.stringify(UserBalanceModel.toGraphQL(newBalanceFrom)),
        ]);
      }
    }
    if (to !== EMPTY_ADDRESS) {
      const balanceTo = await UserBalanceModel.findOne({
        address: this.address,
        user: to,
      });

      if (balanceTo !== null) {
        const updatedBalance = BigNumber.from(balanceTo.balance)
          .add(BigNumber.from(value))
          .toString();

        await UserBalanceModel.updateOne(
          { address: this.address, user: to },
          { balance: updatedBalance }
        );

        const newBalanceFrom = (await UserBalanceModel.findOne({
          address: this.address,
          user: from,
        })) as HydratedDocument<IUserBalance>;

        pubSub.publish(`UserBalance.${this.chainId}.${newBalanceFrom.user}`, [
          JSON.stringify(UserBalanceModel.toGraphQL(newBalanceFrom)),
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

    this.interface = new InterfaceProjectToken(
      this.chainId,
      this.provider,
      interfaceProjectToken,
      this.directory,
      this
    );
    await this.interface.init();
    this.interface.subscribeToEvents();

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
    const oldBalance = await UserBalanceModel.findOne({
      address: this.address,
      user,
    });

    if (oldBalance !== null) {
      const updatedBalance = BigNumber.from(oldBalance.fullyChargedBalance)
        .add(BigNumber.from(value))
        .toString();

      await UserBalanceModel.updateOne(
        { address: this.address, user },
        { fullyChargedBalance: updatedBalance }
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
    jsonModel.totalTokenAllocated = BigNumber.from(
      jsonModel.totalTokenAllocated
    )
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
    const oldBalance = await UserBalanceModel.findOne({
      address: this.address,
      user,
    });

    if (oldBalance !== null) {
      const updatedBalance = BigNumber.from(oldBalance.fullyChargedBalance)
        .sub(BigNumber.from(value))
        .toString();

      await UserBalanceModel.updateOne(
        { address: this.address, user },
        { fullyChargedBalance: updatedBalance }
      );

      const newBalance = (await UserBalanceModel.findOne({
        address: this.address,
        user,
      })) as HydratedDocument<IUserBalance>;

      pubSub.publish(`UserBalance.${this.chainId}.${newBalance.user}`, [
        JSON.stringify(UserBalanceModel.toGraphQL(newBalance)),
      ]);
    }

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
    // nothing to do, balance have been updated by onTransferEvent handler
  }

  async onClaimedRewardPerShareUpdatedEvent([
    user,
    value,
  ]: any[]): Promise<void> {
    const oldBalance = await UserBalanceModel.findOne({
      address: this.address,
      user,
    });

    if (oldBalance !== null) {
      await UserBalanceModel.updateOne(
        { address: this.address, user },
        { claimedRewardPerShare1e18: value }
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

  async onCurrentRewardPerShareAndStakingCheckpointUpdatedEvent([
    rewardPerShare1e18,
    blockTime,
  ]: any[]): Promise<void> {
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
    const oldBalance = await UserBalanceModel.findOne({
      address: this.address,
      user,
    });

    if (oldBalance !== null) {
      const balance = BigNumber.from(oldBalance.partiallyChargedBalance)
        .sub(BigNumber.from(value))
        .toString();

      await UserBalanceModel.updateOne(
        { address: this.address, user },
        { partiallyChargedBalance: balance }
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
    const oldBalance = await UserBalanceModel.findOne({
      address: this.address,
      user,
    });

    if (oldBalance !== null) {
      const { dateOfPartiallyCharged } = await this.instance.userLiquiToken(
        user
      );

      await UserBalanceModel.updateOne(
        { address: this.address, user },
        {
          fullyChargedBalance: "0",
          partiallyChargedBalance,
          dateOfPartiallyCharged: dateOfPartiallyCharged.toString(),
        }
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
}
