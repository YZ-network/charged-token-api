import mongoose, { HydratedDocument } from "mongoose";
import { recordToEntryList } from "../functions";
import { IModel, IOwnable } from "../types";

export interface IDirectory extends IOwnable {
  directory: string[];
  whitelistedProjectOwners: string[];
  projects: string[];
  projectRelatedToLT: Record<string, string>;
  whitelist: Record<string, string>;
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

directorySchema.static(
  "toGraphQL",
  function (doc: HydratedDocument<IDirectory>): any {
    const result = doc.toJSON();
    return {
      ...result,
      projectRelatedToLT: recordToEntryList(result.projectRelatedToLT),
      whitelist: recordToEntryList(result.whitelist),
    };
  }
);

export const DirectoryModel = mongoose.model<IDirectory, IModel<IDirectory>>(
  "Directory",
  directorySchema
);
