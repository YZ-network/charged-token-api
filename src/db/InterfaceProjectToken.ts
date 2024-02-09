import mongoose from "mongoose";
import { IInterfaceProjectToken } from "../core/types";

const interfaceProjectTokenSchema = new mongoose.Schema<IInterfaceProjectToken, mongoose.Model<IInterfaceProjectToken>>(
  {
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
  },
);

export const InterfaceProjectTokenModel = mongoose.model<
  IInterfaceProjectToken,
  mongoose.Model<IInterfaceProjectToken>
>("InterfaceProjectToken", interfaceProjectTokenSchema);
