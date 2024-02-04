import mongoose, { type HydratedDocument } from "mongoose";
import { type IErc20, type IModel } from "../types";

interface IChargedTokenConstants {
  fractionInitialUnlockPerThousand: string;
  durationCliff: string;
  durationLinearVesting: string;
  maxInitialTokenAllocation: string;
  maxWithdrawFeesPerThousandForLT: string;
  maxClaimFeesPerThousandForPT: string;
  maxStakingAPR: string;
  maxStakingTokenAmount: string;
}

interface IChargedTokenStaking {
  stakingStartDate: string;
  stakingDuration: string;
  stakingDateLastCheckpoint: string;
  campaignStakingRewards: string;
  totalStakingRewards: string;
}

interface IChargedTokenToggles {
  areUserFunctionsDisabled: boolean;
  isInterfaceProjectTokenLocked: boolean;
  areAllocationsTerminated: boolean;
}

interface IChargedTokenFundraising {
  fundraisingTokenSymbol: string;
  priceTokenPer1e18: string;
  fundraisingToken: string;
  isFundraisingActive: boolean;
}

export interface IChargedToken
  extends IChargedTokenConstants,
    IChargedTokenToggles,
    IChargedTokenStaking,
    IChargedTokenFundraising,
    IErc20 {
  interfaceProjectToken: string;
  ratioFeesToRewardHodlersPerThousand: string;
  currentRewardPerShare1e18: string;
  stakedLT: string;
  totalLocked: string;
  totalTokenAllocated: string;
  withdrawFeesPerThousandForLT: string;
  isFundraisingContract: boolean;
}

const chargedTokenSchema = new mongoose.Schema<IChargedToken, IModel<IChargedToken>>({
  // contract
  chainId: { type: Number, required: true },
  initBlock: { type: Number, required: true },
  lastUpdateBlock: { type: Number, required: true },
  address: { type: String, required: true },
  // ownable
  owner: { type: String, required: true },
  // erc20
  name: { type: String, required: true },
  symbol: { type: String, required: true },
  decimals: { type: String, required: true },
  totalSupply: String,
  // constants
  fractionInitialUnlockPerThousand: String,
  durationCliff: String,
  durationLinearVesting: String,
  maxInitialTokenAllocation: String,
  maxWithdrawFeesPerThousandForLT: String,
  maxClaimFeesPerThousandForPT: String,
  maxStakingAPR: String,
  maxStakingTokenAmount: String,
  // toggles
  areUserFunctionsDisabled: Boolean,
  isInterfaceProjectTokenLocked: Boolean,
  areAllocationsTerminated: Boolean,
  // variables
  interfaceProjectToken: String,
  ratioFeesToRewardHodlersPerThousand: String,
  currentRewardPerShare1e18: String,
  stakedLT: String,
  totalLocked: String,
  totalTokenAllocated: String,
  withdrawFeesPerThousandForLT: String,
  // staking
  stakingStartDate: String,
  stakingDuration: String,
  stakingDateLastCheckpoint: String,
  campaignStakingRewards: String,
  totalStakingRewards: String,
  // fundraising
  isFundraisingContract: Boolean,
  fundraisingTokenSymbol: String,
  priceTokenPer1e18: String,
  fundraisingToken: String,
  isFundraisingActive: Boolean,
});

chargedTokenSchema.static("toGraphQL", function (doc: HydratedDocument<IChargedToken>): any {
  return doc.toJSON();
});

export const ChargedTokenModel = mongoose.model<IChargedToken, IModel<IChargedToken>>(
  "ChargedToken",
  chargedTokenSchema,
);
