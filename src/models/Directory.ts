import mongoose from "mongoose";
import { IDirectory } from "../loaders";
import { IModel } from "./types";

const { Schema } = mongoose;

const directorySchema = new Schema<IDirectory, IModel<IDirectory>>({
  chainId: { type: Number, required: true },
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

export const DirectoryModel = mongoose.model<IDirectory, IModel<IDirectory>>("Directory", directorySchema);
