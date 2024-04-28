import mongoose from "mongoose";

const parsedBlockSchema = new mongoose.Schema<IParsedBlock, mongoose.Model<IParsedBlock>>({
  chainId: { type: Number, required: true },
  lastUpdateBlock: { type: Number, required: true },
});

parsedBlockSchema.index({ chainId: 1 }, { unique: true });

export const ParsedBlockModel = mongoose.model<IParsedBlock, mongoose.Model<IParsedBlock>>(
  "ParsedBlock",
  parsedBlockSchema,
);
