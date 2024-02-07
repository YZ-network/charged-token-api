import { AbstractLoader } from "./AbstractLoader";
import { DataType, IContract, IUserBalance } from "./types";

export abstract class AbstractBlockchainRepository {
  abstract getBlockNumber(): Promise<number>;
  abstract getUserBalance(address: string, user: string): Promise<IUserBalance | null>;
  abstract getUserBalancePT(ptAddress: string, user: string): Promise<string>;
  abstract getUserPTBalanceFromDb(ptAddress: string, user: string): Promise<string | null>;
  abstract setProjectTokenAddressOnBalances(address: string, ptAddress: string, blockNumber: number): Promise<void>;
  abstract getChargedTokenFundraisingStatus(address: string): Promise<boolean>;
  abstract getProjectRelatedToLT(address: string, contract: string): Promise<string>;
  abstract getUserLiquiToken(address: string, user: string): Promise<{ dateOfPartiallyCharged: number }>;
  abstract loadUserBalances(
    blockNumber: number,
    user: string,
    ctAddress: string,
    interfaceAddress?: string,
    ptAddress?: string,
  ): Promise<IUserBalance>;

  abstract subscribeToEvents(dataType: DataType, address: string, loader: AbstractLoader<any>): void;
  abstract registerContract<T extends IContract>(
    dataType: DataType,
    address: string,
    blockNumber: number,
    loader: AbstractLoader<T>,
  ): Promise<T>;
  abstract unregisterContract(dataType: DataType, address: string, remove?: boolean): Promise<void>;
  abstract isContractRegistered(address: string): boolean;
  abstract getLastState<T>(address: string): T;
  abstract isDelegableStillReferenced(address: string): boolean;
  abstract unsubscribeEvents(address: string): void;
  abstract applyUpdateAndNotify<T>(
    dataType: DataType,
    address: string,
    data: Partial<T>,
    blockNumber: number,
    eventName?: string,
  ): Promise<void>;
  abstract updateBalanceAndNotify(
    address: string,
    user: string,
    balanceUpdates: Partial<IUserBalance>,
    blockNumber: number,
    ptAddress?: string,
    eventName?: string,
  ): Promise<void>;
}
