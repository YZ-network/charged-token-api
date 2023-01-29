import { ethers } from "ethers";
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
    const ctData = await this.load();
    await this.saveOrUpdate(ctData);

    if (ctData.interfaceProjectToken !== EMPTY_ADDRESS) {
      this.interface = new InterfaceProjectToken(
        this.provider,
        ctData.interfaceProjectToken
      );
      await this.interface.init();
    }
  }

  async load() {
    console.log("Reading charged token @", this.address);

    const ins = this.instance;

    return {
      // ownable
      address: this.address,
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

  async saveOrUpdate(data: IChargedToken) {
    if (!(await ChargedTokenModel.exists({ address: data.address }))) {
      await this.toModel(data).save();
    } else {
      await ChargedTokenModel.updateOne({ address: data.address }, data);
    }
  }

  subscribeToEvents(): void {
    // ERC20 events
    // event Transfer(address indexed from, address indexed to, uint256 value);
    this.instance.on("Transfer", (event) => {
      console.log("received Transfer event :", event);
    });

    // self events
    /*
      event LTAllocatedByOwner(address _user, uint _value, uint _hodlRewards, bool _isAllocationStaked);

  event LTAllocatedThroughSale(address _user, uint _valueLT, uint _valuePayment, uint _hodlRewards);

  event LTReceived(address _user, uint _value, uint _totalFees, uint _feesToRewardHodlers, uint _hodlRewards);

  event LTDeposited(address _user, uint _value, uint _hodlRewards);
*/
  }

  toModel(data: IChargedToken) {
    return (ChargedTokenModel as any).toModel(data);
  }
}
