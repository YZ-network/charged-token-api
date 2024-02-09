import mongoose from "mongoose";
import { IDirectory } from "../core/types";

const { Schema } = mongoose;

const directorySchema = new Schema<IDirectory, mongoose.Model<IDirectory>>({
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

export const DirectoryModel = mongoose.model<IDirectory, mongoose.Model<IDirectory>>("Directory", directorySchema);
