import { BigNumber, ethers } from "ethers";
import { contracts } from "../contracts";
import { ChargedTokenModel, IChargedToken } from "../models";
import { EMPTY_ADDRESS } from "../types";
import { AbstractLoader } from "./AbstractLoader";
import { InterfaceProjectToken } from "./InterfaceProjectToken";

export class ChargedToken extends AbstractLoader<IChargedToken> {
  interface: InterfaceProjectToken | undefined;

  constructor(provider: ethers.providers.JsonRpcProvider, address: string) {
    super(provider, address, contracts.LiquidityToken);
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

    this.subscribeToEvents();
  }

  async get() {
    return await ChargedTokenModel.findOne({ address: this.address });
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

  async saveOrUpdate(data: IChargedToken) {
    let result;
    if (!(await ChargedTokenModel.exists({ address: data.address }))) {
      result = await this.toModel(data).save();
    } else {
      result = await ChargedTokenModel.updateOne(
        { address: data.address },
        data
      );
    }
    this.lastUpdateBlock = this.actualBlock;
    this.lastState = result.toJSON();
    return result;
  }

  onEvent(name: string, ...args: any[]): void {
    const eventHandlerName = `on${name}Event` as
      | "onTransferEvent"
      | "onLTAllocatedByOwner"
      | "onLTAllocatedThroughSale"
      | "onLTReceived"
      | "onLTDeposited";
    this[eventHandlerName](...args);
  }

  onTransferEvent(from: string, to: string, value: BigNumber): void {}
  onLTAllocatedByOwner(
    user: string,
    value: BigNumber,
    hodlRewards: BigNumber,
    isAllocationStaked: boolean
  ): void {}
  onLTAllocatedThroughSale(
    user: string,
    valueLT: BigNumber,
    valuePayment: BigNumber,
    hodlRewards: BigNumber
  ): void {}
  onLTReceived(
    user: string,
    value: BigNumber,
    totalFees: BigNumber,
    feesToRewardHodlers: BigNumber,
    hodlRewards: BigNumber
  ): void {}
  onLTDeposited(user: string, value: BigNumber, hodlRewards: BigNumber): void {}

  subscribeToEvents(): void {
    [
      "Transfer",
      "LTAllocatedByOwner",
      "LTAllocatedThroughSale",
      "LTReceived",
      "LTDeposited",
    ].forEach((event) => this.subscribeToEvent(event));
  }

  toModel(data: IChargedToken) {
    return (ChargedTokenModel as any).toModel(data);
  }
}
