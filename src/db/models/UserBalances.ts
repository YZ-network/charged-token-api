import mongoose from "mongoose";

const userBalanceSchema = new mongoose.Schema<IUserBalance, mongoose.Model<IUserBalance>>({
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

export const UserBalanceModel = mongoose.model<IUserBalance, mongoose.Model<IUserBalance>>(
  "UserBalance",
  userBalanceSchema,
);
