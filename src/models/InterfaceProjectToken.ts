import mongoose, { HydratedDocument } from "mongoose";
import { recordToEntryList } from "../functions";
import { IModel, IOwnable } from "../types";

export interface IInterfaceProjectToken extends IOwnable {
  liquidityToken: string;
  projectToken: string;
  dateLaunch: string;
  dateEndCliff: string;
  claimFeesPerThousandForPT: string;
  valueProjectTokenToFullRecharge: Record<string, string>;
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
  valueProjectTokenToFullRecharge: { type: Map, of: String },
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
    const result = doc.toJSON();
    return {
      ...result,
      valueProjectTokenToFullRecharge: recordToEntryList(
        result.valueProjectTokenToFullRecharge
      ),
    };
  }
);

export const InterfaceProjectTokenModel = mongoose.model<
  IInterfaceProjectToken,
  IModel<IInterfaceProjectToken>
>("InterfaceProjectToken", interfaceProjectTokenSchema);
