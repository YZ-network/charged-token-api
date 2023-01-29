import mongoose, { HydratedDocument } from "mongoose";
import { IModel, IOwnable } from "../types";

export interface IDirectory extends IOwnable {
  directory: string[];
  whitelistedProjectOwners: string[];
  projects: string[];
  projectRelatedToLT: Map<string, string>;
  whitelist: Map<string, string>;
  areUserFunctionsDisabled: boolean;
}

const { Schema } = mongoose;

const directorySchema = new Schema<IDirectory, IModel<IDirectory>>({
  lastUpdateBlock: { type: Number, required: true },
  address: { type: String, required: true },
  owner: { type: String, required: true },
  directory: [String],
  whitelistedProjectOwners: [String],
  projects: [String],
  projectRelatedToLT: { type: Map, of: String },
  whitelist: { type: Map, of: String },
  areUserFunctionsDisabled: Boolean,
});

directorySchema.static(
  "toModel",
  function (data: IDirectory): HydratedDocument<IDirectory> {
    const model = new this();
    Object.keys(data).forEach((key) => {
      model[key] = data[key];
    });
    return model;
  }
);

export const DirectoryModel = mongoose.model<IDirectory, IModel<IDirectory>>(
  "Directory",
  directorySchema
);
