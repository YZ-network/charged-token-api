import mongoose from "mongoose";

const { Schema } = mongoose;

const directorySchema = new Schema({
  address: { type: String, required: true },
  owner: { type: String, required: true },
  directory: [String],
  whitelistedProjectOwners: [String],
  projects: [String],
  projectRelatedToLT: { type: Map, of: String },
  whitelist: { type: Map, of: String },
  areUserFunctionsDisabled: Boolean,
});

export const DirectoryModel = mongoose.model("Directory", directorySchema);

const chargedTokenSchema = new Schema({
  // constants
  address: { type: String, required: true },
  owner: { type: String, required: true },
  name: { type: String, required: true },
  symbol: { type: String, required: true },
  decimals: Number,
  durationCliff: String,
  durationLinearVesting: String,
  fractionInitialUnlockPerThousand: String,
  maxWithdrawFeesPerThousand: String,
  maxClaimFeesPerThousand: String,
  // variables
  disabled: Boolean,
  totalSupply: String,
  totalLocked: String,
  totalTokenAllocated: String,
  stakedLT: String,
  withdrawFeesPerThousandForLT: String,
  interfaceAddress: String,
});

export const ChargedTokenModel = mongoose.model(
  "ChargedToken",
  chargedTokenSchema
);
