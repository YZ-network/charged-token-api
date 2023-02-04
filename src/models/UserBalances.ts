import mongoose, { HydratedDocument } from "mongoose";
import { IModel } from "../types";

export interface IChargedTokenBalance {
  balance: string;
  fullyChargedBalance: string;
  partiallyChargedBalance: string;
  dateOfPartiallyCharged: string;
}

export interface IChargedTokenClaims {
  balancePT: string;
  chargedClaimableProjectToken: string;
  claimableProjectToken: string;
  ptNeededToRecharge: string;
}

export interface IUserBalance {
  lastUpdateBlock: number;
  user: string;
  address: string;
  balances: IChargedTokenBalance;
  claims: IChargedTokenClaims;
}

const charedTokenBalanceSchema = new mongoose.Schema<IChargedTokenBalance>({
  balance: { type: String, default: "0" },
  fullyChargedBalance: { type: String, default: "0" },
  partiallyChargedBalance: { type: String, default: "0" },
  dateOfPartiallyCharged: { type: String, default: "0" },
});

const charedTokenClaimsSchema = new mongoose.Schema<IChargedTokenClaims>({
  balancePT: { type: String, default: "0" },
  chargedClaimableProjectToken: { type: String, default: "0" },
  claimableProjectToken: { type: String, default: "0" },
  ptNeededToRecharge: { type: String, default: "0" },
});

const userBalanceSchema = new mongoose.Schema<
  IUserBalance,
  IModel<IUserBalance>
>({
  lastUpdateBlock: { type: Number, required: true },
  user: String,
  address: String,
  balances: { type: charedTokenBalanceSchema },
  claims: { type: charedTokenClaimsSchema },
});

userBalanceSchema.static(
  "toModel",
  function (data: IUserBalance): HydratedDocument<IUserBalance> {
    const model = new this();
    Object.keys(data).forEach((key) => {
      model[key] = data[key];
    });
    return model;
  }
);

userBalanceSchema.static(
  "toGraphQL",
  function (doc: HydratedDocument<IUserBalance>): any {
    return doc.toJSON();
  }
);

export const UserBalanceModel = mongoose.model<
  IUserBalance,
  IModel<IUserBalance>
>("UserBalance", userBalanceSchema);
