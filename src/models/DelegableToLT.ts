import mongoose, { HydratedDocument } from "mongoose";
import { IErc20, IModel } from "../types";

export interface IDelegableToLT extends IErc20 {
  validatedInterfaceProjectToken: string[];
  isListOfInterfaceProjectTokenComplete: boolean;
}

const delegableToLTSchema = new mongoose.Schema<
  IDelegableToLT,
  IModel<IDelegableToLT>
>({
  // contract
  lastUpdateBlock: { type: Number, required: true },
  address: { type: String, required: true },
  // ownable
  owner: { type: String, required: true },
  // erc20
  name: { type: String, required: true },
  symbol: { type: String, required: true },
  decimals: Number,
  balances: { type: Map, of: String },
  totalSupply: String,
  // other
  validatedInterfaceProjectToken: [String],
  isListOfInterfaceProjectTokenComplete: Boolean,
});

delegableToLTSchema.static(
  "toModel",
  function (data: IDelegableToLT): HydratedDocument<IDelegableToLT> {
    const model = new this();
    Object.keys(data).forEach((key) => {
      model[key] = data[key];
    });
    return model;
  }
);

export const DelegableToLTModel = mongoose.model<
  IDelegableToLT,
  IModel<IDelegableToLT>
>("DelegableToLT", delegableToLTSchema);
