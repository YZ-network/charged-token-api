import { EventHandlerStatus } from "../globals";
import { IEvent, IInterfaceProjectToken, IUserBalance } from "../models";
import { DataType, IContract } from "../types";

export abstract class AbstractDbRepository {
  abstract exists(dataType: DataType, chainId: number, address: string): Promise<boolean>;
  abstract existsBalance(chainId: number, address: string, user: string): Promise<boolean>;
  abstract existsEvent(
    chainId: number,
    address: string,
    blockNumber: number,
    txIndex: number,
    logIndex: number,
  ): Promise<boolean>;

  abstract get<T>(dataType: DataType, chainId: number, address: string): Promise<T | null>;
  abstract getInterfaceByChargedToken(chainId: number, ctAddress: string): Promise<IInterfaceProjectToken | null>;
  abstract getBalances(chainId: number, address: string): Promise<IUserBalance[]>;
  abstract getBalance(chainId: number, address: string, user: string): Promise<IUserBalance | null>;
  abstract getBalancesByProjectToken(chainId: number, ptAddress: string, user: string): Promise<IUserBalance[]>;

  abstract save<T extends IContract>(dataType: DataType, data: T): Promise<void>;
  abstract saveBalance(data: IUserBalance): Promise<void>;
  abstract saveEvent(data: IEvent): Promise<void>;

  abstract update<T extends IContract>(
    dataType: DataType,
    data: Partial<T> & Pick<IContract, "chainId" | "address" | "lastUpdateBlock">,
  ): Promise<void>;
  abstract updateBalance(
    data: Partial<IUserBalance> & Pick<IUserBalance, "user" | "chainId" | "address" | "lastUpdateBlock">,
  ): Promise<void>;
  abstract updateOtherBalancesByProjectToken(
    addressToExclude: string,
    data: Partial<IUserBalance> & Pick<IUserBalance, "user" | "chainId" | "lastUpdateBlock" | "ptAddress">,
  ): Promise<void>;
  abstract updateEventStatus(
    event: Pick<IEvent, "chainId" | "address" | "blockNumber" | "txIndex" | "logIndex">,
    newStatus: EventHandlerStatus,
  ): Promise<void>;

  abstract delete<T extends IContract>(dataType: DataType, chainId: number, address: string | string[]): Promise<void>;
}
