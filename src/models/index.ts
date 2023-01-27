import { BigNumber } from "ethers";
import mongoose, { HydratedDocument } from "mongoose";
import { Ownable } from "../types";

export interface DirectoryData extends Ownable {
  directory: string[];
  whitelistedProjectOwners: string[];
  projects: string[];
  projectRelatedToLT: Record<string, string>;
  whitelist: Record<string, string>;
  areUserFunctionsDisabled: boolean;
}

const { Schema } = mongoose;

const directorySchema = new Schema<DirectoryData>(
  {
    address: { type: String, required: true },
    owner: { type: String, required: true },
    directory: [String],
    whitelistedProjectOwners: [String],
    projects: [String],
    projectRelatedToLT: { type: Map, of: String },
    whitelist: { type: Map, of: String },
    areUserFunctionsDisabled: Boolean,
  },
  {
    statics: {
      toModel(data: DirectoryData): HydratedDocument<DirectoryData> {
        const model = new this();
        Object.keys(data).forEach((key) => {
          if (data[key] instanceof BigNumber) {
            model[key] = data[key].toString();
          } else {
            model[key] = data[key];
          }
        });
        return model;
      },
    },
  }
);

export const DirectoryModel = mongoose.model<DirectoryData>(
  "Directory",
  directorySchema
);

export interface ChargedTokenData extends Ownable {
  name: string;
  symbol: string;
  decimals: number;
  durationCliff: string;
  durationLinearVesting: string;
  fractionInitialUnlockPerThousand: string;
  maxWithdrawFeesPerThousand: string;
  maxClaimFeesPerThousand: string;
  disabled: boolean;
  totalSupply: string;
  totalLocked: string;
  totalTokenAllocated: string;
  stakedLT: string;
  withdrawFeesPerThousandForLT: string;
  interfaceAddress: string;
}

const chargedTokenSchema = new Schema<ChargedTokenData>(
  {
    // constants
    address: { type: String, required: true },
    owner: { type: String, required: true },
    name: { type: String, required: true },
    symbol: { type: String, required: true },
    decimals: Number,
    durationCliff: String,
    durationLinearVesting: String,
    fractionInitialUnlockPerThousand: String,
    maxWithdrawFeesPerThousand: String,
    maxClaimFeesPerThousand: String,
    // variables
    disabled: Boolean,
    totalSupply: String,
    totalLocked: String,
    totalTokenAllocated: String,
    stakedLT: String,
    withdrawFeesPerThousandForLT: String,
    interfaceAddress: String,
  },
  {
    statics: {
      toModel(data: ChargedTokenData): HydratedDocument<ChargedTokenData> {
        const model = new this();
        Object.keys(data).forEach((key) => {
          if (data[key] instanceof BigNumber) {
            model[key] = data[key].toString();
          } else {
            model[key] = data[key];
          }
        });
        return model;
      },
    },
  }
);

export const ChargedTokenModel = mongoose.model<ChargedTokenData>(
  "ChargedToken",
  chargedTokenSchema
);
