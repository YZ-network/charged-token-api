import mongoose, { HydratedDocument } from "mongoose";
import { IModel, IOwnable } from "../types";

export interface IInterfaceProjectToken extends IOwnable {
  liquidityToken: string;
  projectToken: string;
  dateLaunch: string;
  dateEndCliff: string;
  claimFeesPerThousandForPT: string;
  valueProjectTokenToFullRecharge: Map<string, string>;
}

const interfaceProjectTokenSchema = new mongoose.Schema<
  IInterfaceProjectToken,
  IModel<IInterfaceProjectToken>
>({
  // contract
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
  valueProjectTokenToFullRecharge: { type: Map, of: String },
});

interfaceProjectTokenSchema.static(
  "toModel",
  function (
    data: IInterfaceProjectToken
  ): HydratedDocument<IInterfaceProjectToken> {
    const model = new this();
    Object.keys(data).forEach((key) => {
      model[key] = data[key];
    });
    return model;
  }
);

export const InterfaceProjectTokenModel = mongoose.model<
  IInterfaceProjectToken,
  IModel<IInterfaceProjectToken>
>("InterfaceProjectToken", interfaceProjectTokenSchema);
