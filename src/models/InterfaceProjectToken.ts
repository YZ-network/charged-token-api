import mongoose from "mongoose";
import { IInterfaceProjectToken } from "../loaders/types";
import { IModel } from "./types";

const interfaceProjectTokenSchema = new mongoose.Schema<IInterfaceProjectToken, IModel<IInterfaceProjectToken>>({
  // contract
  chainId: { type: Number, required: true },
  lastUpdateBlock: { type: Number, required: true },
  address: { type: String, required: true },
  // ownable
  owner: { type: String, required: true },
  // other
  liquidityToken: String,
  projectToken: String,
  dateLaunch: String,
  dateEndCliff: String,
  claimFeesPerThousandForPT: String,
});

export const InterfaceProjectTokenModel = mongoose.model<IInterfaceProjectToken, IModel<IInterfaceProjectToken>>(
  "InterfaceProjectToken",
  interfaceProjectTokenSchema,
);
