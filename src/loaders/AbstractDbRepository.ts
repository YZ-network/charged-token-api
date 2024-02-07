import {
  DataType,
  EventHandlerStatus,
  IContract,
  IDirectory,
  IEvent,
  IInterfaceProjectToken,
  IUserBalance,
} from "./types";

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

  abstract isUserBalancesLoaded(chainId: number, user: string): Promise<boolean>;

  abstract countEvents(chainId: number): Promise<number>;

  abstract get<T>(dataType: DataType, chainId: number, address: string): Promise<T | null>;
  abstract getAllMatching<T extends IContract>(
    dataType: DataType,
    filter: Partial<T> & Pick<T, "chainId">,
  ): Promise<T[]>;
  abstract getDirectory(chainId: number): Promise<IDirectory | null>;
  abstract getInterfaceByChargedToken(chainId: number, ctAddress: string): Promise<IInterfaceProjectToken | null>;
  abstract getBalances(chainId: number, address: string): Promise<IUserBalance[]>;
  abstract getBalance(chainId: number, address: string, user: string): Promise<IUserBalance | null>;
  abstract getPTBalance(chainId: number, ptAddress: string, user: string): Promise<string | null>;
  abstract getBalancesByProjectToken(chainId: number, ptAddress: string, user: string): Promise<IUserBalance[]>;
  abstract getAllEvents(): Promise<IEvent[]>;
  abstract getEventsPaginated(chainId: number, count: number, offset: number): Promise<IEvent[]>;

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
  abstract deletePendingAndFailedEvents(chainId: number): Promise<void>;
}
