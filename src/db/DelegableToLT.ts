import mongoose from "mongoose";
import { IDelegableToLT } from "../core/types";

const delegableToLTSchema = new mongoose.Schema<IDelegableToLT, mongoose.Model<IDelegableToLT>>({
  // contract
  chainId: { type: Number, required: true },
  lastUpdateBlock: { type: Number, required: true },
  address: { type: String, required: true },
  // ownable
  owner: { type: String, required: true },
  // erc20
  name: { type: String, required: true },
  symbol: { type: String, required: true },
  decimals: { type: String, required: true },
  totalSupply: String,
  // other
  validatedInterfaceProjectToken: [String],
  isListOfInterfaceProjectTokenComplete: Boolean,
});

export const DelegableToLTModel = mongoose.model<IDelegableToLT, mongoose.Model<IDelegableToLT>>(
  "DelegableToLT",
  delegableToLTSchema,
);
