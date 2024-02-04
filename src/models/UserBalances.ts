import mongoose, { type HydratedDocument } from "mongoose";
import { type IModel } from "../types";

export interface IChargedTokenBalance {
  balance: string;
  balancePT: string;
  fullyChargedBalance: string;
  partiallyChargedBalance: string;
  dateOfPartiallyCharged: string;
  claimedRewardPerShare1e18: string;
  valueProjectTokenToFullRecharge: string;
}

export interface IUserBalance extends IChargedTokenBalance {
  chainId: number;
  lastUpdateBlock: number;
  user: string;
  address: string;
  ptAddress: string;
}

const userBalanceSchema = new mongoose.Schema<IUserBalance, IModel<IUserBalance>>({
  chainId: { type: Number, required: true },
  lastUpdateBlock: { type: Number, required: true },
  user: String,
  address: String,
  ptAddress: String,
  balance: { type: String, default: "0" },
  balancePT: { type: String, default: "0" },
  fullyChargedBalance: { type: String, default: "0" },
  partiallyChargedBalance: { type: String, default: "0" },
  dateOfPartiallyCharged: { type: String, default: "0" },
  claimedRewardPerShare1e18: { type: String, default: "0" },
  valueProjectTokenToFullRecharge: { type: String, default: "0" },
});

userBalanceSchema.static("toGraphQL", function (doc: HydratedDocument<IUserBalance>): any {
  return doc.toJSON();
});

export const UserBalanceModel = mongoose.model<IUserBalance, IModel<IUserBalance>>("UserBalance", userBalanceSchema);
