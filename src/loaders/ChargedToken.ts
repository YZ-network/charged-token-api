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
      const balanceFrom = await this.getBalance(this.address, from);
      if (balanceFrom !== null) {
        const balance = BigNumber.from(balanceFrom.balance)
          .sub(BigNumber.from(value))
          .toString();
        await this.updateBalanceAndNotify(this.address, from, { balance });
      }
    }
    if (to !== EMPTY_ADDRESS) {
      const balanceTo = await this.getBalance(this.address, to);

      if (balanceTo !== null) {
        const balance = BigNumber.from(balanceTo.balance)
          .add(BigNumber.from(value))
          .toString();

        await this.updateBalanceAndNotify(this.address, to, { balance });
      }
    }
    if (from === EMPTY_ADDRESS) {
      const jsonModel = await this.getJsonModel();
      const update = {
        totalSupply: BigNumber.from(jsonModel.totalSupply)
          .add(BigNumber.from(value))
          .toString(),
      };
      await this.applyUpdateAndNotify(update);
    }
    if (to === EMPTY_ADDRESS) {
      const jsonModel = await this.getJsonModel();
      const update = {
        totalSupply: BigNumber.from(jsonModel.totalSupply)
          .sub(BigNumber.from(value))
          .toString(),
      };
      await this.applyUpdateAndNotify(update);
    }
  }

  async onUserFunctionsAreDisabledEvent([
    areUserFunctionsDisabled,
  ]: any[]): Promise<void> {
    await this.applyUpdateAndNotify({ areUserFunctionsDisabled });
  }

  async onInterfaceProjectTokenSetEvent([
    interfaceProjectToken,
  ]: any[]): Promise<void> {
    this.interface = new InterfaceProjectToken(
      this.chainId,
      this.provider,
      interfaceProjectToken,
      this.directory,
      this
    );
    await this.interface.init();
    this.interface.subscribeToEvents();

    await this.applyUpdateAndNotify({ interfaceProjectToken });
  }

  async onInterfaceProjectTokenIsLockedEvent([]: any[]): Promise<void> {
    await this.applyUpdateAndNotify({ isInterfaceProjectTokenLocked: true });
  }

  async onIncreasedFullyChargedBalanceEvent([
    user,
    value,
  ]: any[]): Promise<void> {
    const oldBalance = await this.getBalance(this.address, user);

    if (oldBalance !== null) {
      const fullyChargedBalance = BigNumber.from(oldBalance.fullyChargedBalance)
        .add(BigNumber.from(value))
        .toString();

      await this.updateBalanceAndNotify(this.address, user, {
        fullyChargedBalance,
      });
    }
  }

  async onLTAllocatedByOwnerEvent([
    user,
    value,
    hodlRewards,
    isAllocationStaked,
  ]: any[]): Promise<void> {
    // total supply updated by transfer events
  }

  async onIncreasedTotalTokenAllocatedEvent([value]: any[]): Promise<void> {
    const jsonModel = await this.getJsonModel();

    const update = {
      totalTokenAllocated: BigNumber.from(jsonModel.totalTokenAllocated)
        .add(BigNumber.from(value))
        .toString(),
    };

    await this.applyUpdateAndNotify(update);
  }

  async onIncreasedStakedLTEvent([value]: any[]): Promise<void> {
    const jsonModel = await this.getJsonModel();

    const update = {
      stakedLT: BigNumber.from(jsonModel.stakedLT)
        .add(BigNumber.from(value))
        .toString(),
    };

    await this.applyUpdateAndNotify(update);
  }

  async onAllocationsAreTerminatedEvent([]: any[]): Promise<void> {
    await this.applyUpdateAndNotify({ areAllocationsTerminated: true });
  }

  async onDecreasedFullyChargedBalanceAndStakedLTEvent([
    user,
    value,
  ]: any[]): Promise<void> {
    const oldBalance = await this.getBalance(this.address, user);

    if (oldBalance !== null) {
      const fullyChargedBalance = BigNumber.from(oldBalance.fullyChargedBalance)
        .sub(BigNumber.from(value))
        .toString();

      await this.updateBalanceAndNotify(this.address, user, {
        fullyChargedBalance,
      });
    }

    const jsonModel = await this.getJsonModel();

    const update = {
      stakedLT: BigNumber.from(jsonModel.stakedLT)
        .sub(BigNumber.from(value))
        .toString(),
    };

    await this.applyUpdateAndNotify(update);
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
    const oldBalance = await this.getBalance(this.address, user);

    if (oldBalance !== null) {
      await this.updateBalanceAndNotify(this.address, user, {
        claimedRewardPerShare1e18: value,
      });
    }
  }

  async onCurrentRewardPerShareAndStakingCheckpointUpdatedEvent([
    rewardPerShare1e18,
    blockTime,
  ]: any[]): Promise<void> {
    await this.applyUpdateAndNotify({
      currentRewardPerShare1e18: rewardPerShare1e18,
      stakingDateLastCheckpoint: blockTime,
    });
  }

  async onIncreasedCurrentRewardPerShareEvent([value]: any[]): Promise<void> {
    const jsonModel = await this.getJsonModel();

    const update = {
      currentRewardPerShare1e18: BigNumber.from(
        jsonModel.currentRewardPerShare1e18
      )
        .add(BigNumber.from(value))
        .toString(),
    };

    await this.applyUpdateAndNotify(update);
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

    const update = {
      stakingStartDate: startDate,
      stakingDateLastCheckpoint: startDate,
      stakingDuration: duration,
      campaignStakingRewards: rewards.toString(),
      totalStakingRewards: BigNumber.from(jsonModel.totalStakingRewards)
        .add(bnRewards)
        .toString(),
      totalTokenAllocated: BigNumber.from(jsonModel.totalTokenAllocated)
        .add(bnRewards)
        .toString(),
      totalSupply: BigNumber.from(jsonModel.totalSupply)
        .add(bnRewards)
        .toString(),
    };

    await this.applyUpdateAndNotify(update);
  }

  async onWithdrawalFeesUpdatedEvent([value]: any[]): Promise<void> {
    await this.applyUpdateAndNotify({
      withdrawFeesPerThousandForLT: value.toString(),
    });
  }

  async onRatioFeesToRewardHodlersUpdatedEvent([value]: any[]): Promise<void> {
    await this.applyUpdateAndNotify({
      ratioFeesToRewardHodlersPerThousand: value.toString(),
    });
  }

  async onDecreasedPartiallyChargedBalanceEvent([
    user,
    value,
  ]: any[]): Promise<void> {
    const oldBalance = await this.getBalance(this.address, user);

    if (oldBalance !== null) {
      const partiallyChargedBalance = BigNumber.from(
        oldBalance.partiallyChargedBalance
      )
        .sub(BigNumber.from(value))
        .toString();

      await this.updateBalanceAndNotify(this.address, user, {
        partiallyChargedBalance,
      });
    }
  }

  async onUpdatedDateOfPartiallyChargedAndDecreasedStakedLTEvent([
    blockTime,
    value,
  ]: any[]): Promise<void> {
    // dateOfPartiallyCharged updated by TokensDischargedEvent
    const jsonModel = await this.getJsonModel();

    const update = {
      stakedLT: BigNumber.from(jsonModel.stakedLT)
        .sub(BigNumber.from(value))
        .toString(),
    };

    await this.applyUpdateAndNotify(update);
  }

  async onTokensDischargedEvent([
    user,
    partiallyChargedBalance,
  ]: any[]): Promise<void> {
    const oldBalance = await this.getBalance(this.address, user);

    if (oldBalance !== null) {
      const { dateOfPartiallyCharged } = await this.instance.userLiquiToken(
        user
      );

      await this.updateBalanceAndNotify(this.address, user, {
        fullyChargedBalance: "0",
        partiallyChargedBalance,
        dateOfPartiallyCharged: dateOfPartiallyCharged.toString(),
      });
    }
  }
}
