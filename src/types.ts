import { HydratedDocument, Model } from "mongoose";

export interface IContract {
  chainId: number;
  address: string;
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
  balances: Record<string, string>;
}

export interface IEntry {
  key: string;
  value: string;
}

export type IKeyValueList = IEntry[];

export type IEventHandler = (args: any[]) => Promise<void>;

export type IToModel<T> = (data: T) => HydratedDocument<T>;

export type IToGraphQL<T> = (doc: HydratedDocument<T>) => any;

export type IModel<T> = Model<T> & {
  toModel: IToModel<T>;
  toGraphQL: IToGraphQL<T>;
};

export const EMPTY_ADDRESS = "0x0000000000000000000000000000000000000000";
