import { type ClientSession, type HydratedDocument, type Model } from "mongoose";

export interface IContract {
  chainId: number;
  address: string;
  initBlock: number;
  lastUpdateBlock: number;
}

export interface IOwnable extends IContract {
  owner: string;
}

export interface IErc20 extends IOwnable {
  name: string;
  symbol: string;
  decimals: string;
  totalSupply: string;
}

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

export type IToModel<T> = (data: T) => HydratedDocument<T>;

export type IToGraphQL<T> = (doc: HydratedDocument<T>) => any;

export type IModel<T> = Model<T>;

export enum DataType {
  ChargedToken = "ChargedToken",
  Directory = "Directory",
  InterfaceProjectToken = "InterfaceProjectToken",
  DelegableToLT = "DelegableToLT",
  UserBalance = "UserBalance",
  Event = "Event",
}

export const EMPTY_ADDRESS = "0x0000000000000000000000000000000000000000";
