import { ClientSession } from "../vendor";
import { AbstractHandler } from "./AbstractHandler";

export abstract class AbstractBlockchainRepository {
  abstract getBlockNumber(): Promise<number>;
  abstract getUserBalance(address: string, user: string, session?: ClientSession): Promise<IUserBalance | null>;
  abstract getUserBalancePT(ptAddress: string, user: string): Promise<string>;
  abstract getUserPTBalanceFromDb(ptAddress: string, user: string, session?: ClientSession): Promise<string | null>;
  abstract setProjectTokenAddressOnBalances(
    address: string,
    ptAddress: string,
    blockNumber: number,
    session?: ClientSession,
  ): Promise<void>;
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
  abstract loadAllUserBalances(user: string, blockNumber: number, address?: string): Promise<IUserBalance[]>;

  abstract subscribeToEvents(dataType: DataType, address: string, loader: AbstractHandler<any>): void;
  abstract registerContract<T extends IContract>(
    dataType: DataType,
    address: string,
    blockNumber: number,
    loader: AbstractHandler<T>,
    session?: ClientSession,
  ): Promise<T>;
  abstract unregisterContract(
    dataType: DataType,
    address: string,
    remove?: boolean,
    session?: ClientSession,
  ): Promise<void>;
  abstract isContractRegistered(address: string): boolean;
  abstract getLastState<T>(dataType: DataType, address: string, session?: ClientSession): Promise<T | null>;
  abstract isDelegableStillReferenced(address: string): Promise<boolean>;
  abstract unsubscribeEvents(address: string): void;
  abstract applyUpdateAndNotify<T>(
    dataType: DataType,
    address: string,
    data: Partial<T>,
    blockNumber: number,
    eventName?: string,
    session?: ClientSession,
  ): Promise<void>;
  abstract updateBalanceAndNotify(
    address: string,
    user: string,
    balanceUpdates: Partial<IUserBalance>,
    blockNumber: number,
    ptAddress?: string,
    eventName?: string,
    session?: ClientSession,
  ): Promise<void>;
}
