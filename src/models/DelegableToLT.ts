import mongoose, { HydratedDocument } from "mongoose";
import { recordToEntryList } from "../functions";
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
  chainId: { type: Number, required: true },
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
    Object.assign(model, data);
    return model;
  }
);

delegableToLTSchema.static(
  "toGraphQL",
  function (doc: HydratedDocument<IDelegableToLT>): any {
    const result = doc.toJSON();
    return {
      ...result,
      balances: recordToEntryList(result.balances),
    };
  }
);

export const DelegableToLTModel = mongoose.model<
  IDelegableToLT,
  IModel<IDelegableToLT>
>("DelegableToLT", delegableToLTSchema);
