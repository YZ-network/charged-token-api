import { ethers } from "ethers";
import { IChargedToken, IDelegableToLT, IDirectory, IInterfaceProjectToken } from "../models";
import { DataType } from "../types";
import { AbstractLoader } from "./AbstractLoader";

export abstract class AbstractBlockchainRepository {
  abstract loadDirectory(address: string, blockNumber: number): Promise<IDirectory>;
  abstract loadChargedToken(address: string, blockNumber: number): Promise<IChargedToken>;
  abstract loadInterfaceProjectToken(address: string, blockNumber: number): Promise<IInterfaceProjectToken>;
  abstract loadDelegableToLT(address: string, blockNumber: number): Promise<IDelegableToLT>;
  abstract loadEvents(dataType: DataType, address: string, startBlock: number): Promise<ethers.Event[]>;
  abstract removeKnownEvents(events: ethers.Event[]): Promise<ethers.Event[]>;
  abstract subscribeToEvents<T>(dataType: DataType, address: string, loader: AbstractLoader<T>): void;
}
