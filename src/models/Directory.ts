import { BigNumber } from "ethers";
import mongoose, { HydratedDocument } from "mongoose";
import { IOwnable } from "../types";

export interface IDirectory extends IOwnable {
  directory: string[];
  whitelistedProjectOwners: string[];
  projects: string[];
  projectRelatedToLT: Record<string, string>;
  whitelist: Record<string, string>;
  areUserFunctionsDisabled: boolean;
}

const { Schema } = mongoose;

const directorySchema = new Schema<IDirectory>(
  {
    address: { type: String, required: true },
    owner: { type: String, required: true },
    directory: [String],
    whitelistedProjectOwners: [String],
    projects: [String],
    projectRelatedToLT: { type: Map, of: String },
    whitelist: { type: Map, of: String },
    areUserFunctionsDisabled: Boolean,
  },
  {
    statics: {
      toModel(data: IDirectory): HydratedDocument<IDirectory> {
        const model = new this();
        Object.keys(data).forEach((key) => {
          if (data[key] instanceof BigNumber) {
            model[key] = data[key].toString();
          } else {
            model[key] = data[key];
          }
        });
        return model;
      },
    },
  }
);

export const DirectoryModel = mongoose.model<IDirectory>(
  "Directory",
  directorySchema
);
