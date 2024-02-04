import mongoose, { type HydratedDocument } from "mongoose";
import { EventHandlerStatus } from "../globals";
import { type IModel } from "../types";

export interface IEvent {
  status: EventHandlerStatus;
  chainId: number;
  address: string;
  blockNumber: number;
  blockDate: string;
  txHash: string;
  txIndex: number;
  logIndex: number;
  name: string;
  contract: string;
  topics: string[];
  args: string[];
}

const { Schema } = mongoose;

const eventSchema = new Schema<IEvent, IModel<IEvent>>({
  status: { type: String, required: true, enum: EventHandlerStatus },
  chainId: { type: Number, required: true },
  address: { type: String, required: true },
  blockNumber: { type: Number, required: true },
  blockDate: { type: String, required: true },
  txHash: { type: String, required: true },
  txIndex: { type: Number, required: true },
  logIndex: { type: Number, required: true },
  name: { type: String, required: true },
  contract: { type: String, required: true },
  topics: { type: [String], required: true },
  args: { type: [String], required: true },
});

eventSchema.index({ chainId: 1, address: 1, blockNumber: 1, txIndex: 1, logIndex: 1 }, { unique: true });

eventSchema.static("toGraphQL", function (doc: HydratedDocument<IEvent>): any {
  return doc.toJSON();
});

export const EventModel = mongoose.model<IEvent, IModel<IEvent>>("Event", eventSchema);
