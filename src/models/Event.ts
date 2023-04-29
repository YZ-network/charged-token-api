import mongoose, { HydratedDocument } from "mongoose";
import { IModel } from "../types";

export enum EventHandlerStatus {
  QUEUED = "QUEUED",
  SUCCESS = "SUCCESS",
  FAILURE = "FAILURE",
}

export interface IEvent {
  status: EventHandlerStatus;
  chainId: number;
  address: string;
  blockNumber: number;
  txHash: string;
  txIndex: number;
  logIndex: number;
  name: string;
  topics: string[];
}

const { Schema } = mongoose;

const eventSchema = new Schema<IEvent, IModel<IEvent>>({
  status: { type: String, required: true, enum: EventHandlerStatus },
  chainId: { type: Number, required: true },
  address: { type: String, required: true },
  blockNumber: { type: Number, required: true },
  txHash: { type: String, required: true },
  txIndex: { type: Number, required: true },
  logIndex: { type: Number, required: true },
  name: { type: String, required: true },
  topics: { type: [String], required: true },
});

eventSchema.static(
  "toModel",
  function (data: IEvent): HydratedDocument<IEvent> {
    const model = new this();
    Object.assign(model, data);
    return model;
  }
);

eventSchema.static("toGraphQL", function (doc: HydratedDocument<IEvent>): any {
  return doc.toJSON();
});

export const EventModel = mongoose.model<IEvent, IModel<IEvent>>(
  "Event",
  eventSchema
);
