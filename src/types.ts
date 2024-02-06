import { type ClientSession } from "mongoose";

export interface IEntry {
  key: string;
  value: string;
}

export type IKeyValueList = IEntry[];

export type IEventHandler = (
  session: ClientSession,
  args: any[],
  blockNumber: number,
  eventName: string,
) => Promise<void>;
