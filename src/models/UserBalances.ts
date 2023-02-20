import mongoose, { HydratedDocument } from "mongoose";
import { IModel } from "../types";

export interface IChargedTokenBalance {
  balance: string;
  balancePT: string;
  fullyChargedBalance: string;
  partiallyChargedBalance: string;
  dateOfPartiallyCharged: string;
}

export interface IUserBalance extends IChargedTokenBalance {
  chainId: number;
  lastUpdateBlock: number;
  user: string;
  address: string;
}

const userBalanceSchema = new mongoose.Schema<
  IUserBalance,
  IModel<IUserBalance>
>({
  chainId: { type: Number, required: true },
  lastUpdateBlock: { type: Number, required: true },
  user: String,
  address: String,
  balance: { type: String, default: "0" },
  balancePT: { type: String, default: "0" },
  fullyChargedBalance: { type: String, default: "0" },
  partiallyChargedBalance: { type: String, default: "0" },
  dateOfPartiallyCharged: { type: String, default: "0" },
});

userBalanceSchema.static(
  "toModel",
  function (data: IUserBalance): HydratedDocument<IUserBalance> {
    const model = new this();
    Object.assign(model, data);
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
