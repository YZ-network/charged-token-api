import { IChargedToken, IDelegableToLT, IDirectory, IInterfaceProjectToken, IUserBalance } from "../models";
import { DataType } from "../types";
import { AbstractLoader } from "./AbstractLoader";

export abstract class AbstractBlockchainRepository {
  abstract getBlockNumber(): Promise<number>;
  abstract loadDirectory(address: string, blockNumber: number): Promise<IDirectory>;
  abstract loadChargedToken(address: string, blockNumber: number): Promise<IChargedToken>;
  abstract getUserBalancePT(ptAddress: string, user: string): Promise<string>;
  abstract getChargedTokenFundraisingStatus(address: string): Promise<boolean>;
  abstract getProjectRelatedToLT(address: string, contract: string): Promise<string>;
  abstract getUserLiquiToken(address: string, user: string): Promise<{ dateOfPartiallyCharged: number }>;
  abstract loadInterfaceProjectToken(address: string, blockNumber: number): Promise<IInterfaceProjectToken>;
  abstract loadDelegableToLT(address: string, blockNumber: number): Promise<IDelegableToLT>;
  abstract loadUserBalances(
    blockNumber: number,
    user: string,
    ctAddress: string,
    interfaceAddress?: string,
    ptAddress?: string,
  ): Promise<IUserBalance>;
  abstract loadAndSyncEvents(
    dataType: DataType,
    address: string,
    startBlock: number,
    loader: AbstractLoader<any>,
  ): Promise<void>;
  abstract subscribeToEvents(dataType: DataType, address: string, loader: AbstractLoader<any>): void;
}
