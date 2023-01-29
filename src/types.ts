export interface IOwnable {
  address: string;
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

export const EMPTY_ADDRESS = "0x0000000000000000000000000000000000000000";
