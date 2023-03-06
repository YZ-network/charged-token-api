import mongoose, { HydratedDocument } from "mongoose";
import { IModel, IOwnable } from "../types";

export interface IInterfaceProjectToken extends IOwnable {
  liquidityToken: string;
  projectToken: string;
  dateLaunch: string;
  dateEndCliff: string;
  claimFeesPerThousandForPT: string;
}

const interfaceProjectTokenSchema = new mongoose.Schema<
  IInterfaceProjectToken,
  IModel<IInterfaceProjectToken>
>({
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

interfaceProjectTokenSchema.static(
  "toModel",
  function (
    data: IInterfaceProjectToken
  ): HydratedDocument<IInterfaceProjectToken> {
    const model = new this();
    Object.assign(model, data);
    return model;
  }
);

interfaceProjectTokenSchema.static(
  "toGraphQL",
  function (doc: HydratedDocument<IInterfaceProjectToken>): any {
    return doc.toJSON();
  }
);

export const InterfaceProjectTokenModel = mongoose.model<
  IInterfaceProjectToken,
  IModel<IInterfaceProjectToken>
>("InterfaceProjectToken", interfaceProjectTokenSchema);
