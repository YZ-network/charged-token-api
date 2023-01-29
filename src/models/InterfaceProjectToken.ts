import mongoose, { HydratedDocument } from "mongoose";
import { IOwnable } from "../types";

export interface IInterfaceProjectToken extends IOwnable {
  liquidityToken: string;
  projectToken: string;
  dateLaunch: string;
  dateEndCliff: string;
  claimFeesPerThousandForPT: string;
  valueProjectTokenToFullRecharge: Record<string, string>;
}

const interfaceProjectTokenSchema = new mongoose.Schema<IInterfaceProjectToken>(
  {
    // ownable
    address: { type: String, required: true },
    owner: { type: String, required: true },
    // other
    liquidityToken: String,
    projectToken: String,
    dateLaunch: String,
    dateEndCliff: String,
    claimFeesPerThousandForPT: String,
    valueProjectTokenToFullRecharge: { type: Map, of: string },
  },
  {
    statics: {
      toModel(
        data: IInterfaceProjectToken
      ): HydratedDocument<IInterfaceProjectToken> {
        const model = new this();
        Object.keys(data).forEach((key) => {
          model[key] = data[key];
        });
        return model;
      },
    },
  }
);

export const InterfaceProjectTokenModel =
  mongoose.model<IInterfaceProjectToken>(
    "InterfaceProjectToken",
    interfaceProjectTokenSchema
  );
