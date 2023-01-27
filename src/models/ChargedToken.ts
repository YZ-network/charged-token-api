import { BigNumber } from "ethers";
import mongoose, { HydratedDocument } from "mongoose";
import { IOwnable } from "../types";

export interface IChargedToken extends IOwnable {
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

const chargedTokenSchema = new mongoose.Schema<IChargedToken>(
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
      toModel(data: IChargedToken): HydratedDocument<IChargedToken> {
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

export const ChargedTokenModel = mongoose.model<IChargedToken>(
  "ChargedToken",
  chargedTokenSchema
);
