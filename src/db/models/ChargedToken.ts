import mongoose from "mongoose";

const chargedTokenSchema = new mongoose.Schema<IChargedToken, mongoose.Model<IChargedToken>>({
  // contract
  chainId: { type: Number, required: true },
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

export const ChargedTokenModel = mongoose.model<IChargedToken, mongoose.Model<IChargedToken>>(
  "ChargedToken",
  chargedTokenSchema,
);
