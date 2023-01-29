import mongoose, { HydratedDocument } from "mongoose";
import { IErc20, IOwnable } from "../types";

export interface IDelegableToLT extends IOwnable, IErc20 {
  validatedInterfaceProjectToken: string[];
  isListOfInterfaceProjectTokenComplete: boolean;
}

const delegableToLTSchema = new mongoose.Schema<IDelegableToLT>(
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
    // other
    validatedInterfaceProjectToken: [String],
    isListOfInterfaceProjectTokenComplete: Boolean,
  },
  {
    statics: {
      toModel(data: IDelegableToLT): HydratedDocument<IDelegableToLT> {
        const model = new this();
        Object.keys(data).forEach((key) => {
          model[key] = data[key];
        });
        return model;
      },
    },
  }
);

export const DelegableToLTModel = mongoose.model<IDelegableToLT>(
  "DelegableToLT",
  delegableToLTSchema
);
