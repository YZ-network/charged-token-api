import mongoose from "mongoose";

const transactionSchema = new mongoose.Schema<ITransaction, mongoose.Model<ITransaction>>({
  chainId: { type: Number, required: true },
  hash: { type: String, required: true },
});

transactionSchema.index({ chainId: 1, hash: 1 }, { unique: true });

export const TransactionModel = mongoose.model<ITransaction, mongoose.Model<ITransaction>>(
  "Transaction",
  transactionSchema,
);
