import { HydratedDocument, Model } from "mongoose";

export interface IContract {
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

export type IKeyValueList = Record<string, string>[];

export type IEventHandler = (args: any[]) => void;

export type IToModel<T> = (data: T) => HydratedDocument<T>;

export type IModel<T> = Model<T> & {
  toModel: IToModel<T>;
};

export const EMPTY_ADDRESS = "0x0000000000000000000000000000000000000000";
