import mongoose, { HydratedDocument } from "mongoose";
import { IErc20 } from "../types";

export interface IChargedTokenConstants {
  fractionInitialUnlockPerThousand: string;
  durationCliff: string;
  durationLinearVesting: string;
  maxInitialTokenAllocation: string;
  maxWithdrawFeesPerThousandForLT: string;
  maxClaimFeesPerThousandForPT: string;
  maxStakingAPR: string;
  maxStakingTokenAmount: string;
}

export interface IChargedTokenStaking {
  stakingStartDate: string;
  stakingDuration: string;
  stakingDateLastCheckpoint: string;
  campaignStakingRewards: string;
  totalStakingRewards: string;
}

export interface IChargedTokenToggles {
  areUserFunctionsDisabled: boolean;
  isInterfaceProjectTokenLocked: boolean;
  areAllocationsTerminated: boolean;
}

interface IUserLiquiToken {
  fullyChargedBalance: string;
  partiallyChargedBalance: string;
  dateOfPartiallyCharged: string;
}

export interface IChargedTokenMaps {
  claimedRewardPerShare1e18: Map<string, string>;
  userLiquiToken: Map<string, IUserLiquiToken>;
}

export interface IChargedToken
  extends IChargedTokenConstants,
    IChargedTokenToggles,
    IChargedTokenStaking,
    IChargedTokenMaps,
    IErc20 {
  interfaceProjectToken: string;
  ratioFeesToRewardHodlersPerThousand: string;
  currentRewardPerShare1e18: string;
  stakedLT: string;
  totalTokenAllocated: string;
  withdrawFeesPerThousandForLT: string;
}

const chargedTokenSchema = new mongoose.Schema<IChargedToken>(
  {
    // ownable
    address: { type: String, required: true },
    owner: { type: String, required: true },
    // erc20
    name: { type: String, required: true },
    symbol: { type: String, required: true },
    decimals: Number,
    balances: { type: Map, of: String },
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
    totalTokenAllocated: String,
    withdrawFeesPerThousandForLT: String,
    // maps
    claimedRewardPerShare1e18: { type: Map, of: String },
    userLiquiToken: {
      type: Map,
      of: new mongoose.Schema({
        fullyChargedBalance: String,
        partiallyChargedBalance: String,
        dateOfPartiallyCharged: String,
      }),
    },
    // staking
    stakingStartDate: String,
    stakingDuration: String,
    stakingDateLastCheckpoint: String,
    campaignStakingRewards: String,
    totalStakingRewards: String,
  },
  {
    statics: {
      toModel(data: IChargedToken): HydratedDocument<IChargedToken> {
        const model = new this();
        Object.keys(data).forEach((key) => {
          model[key] = data[key];
        });
        return model;
      },
    },
  }
);

export const ChargedTokenModel = mongoose.model<IChargedToken>(
  "ChargedToken",
  chargedTokenSchema
);
