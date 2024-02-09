import { ClientSession } from "../vendor";

export abstract class AbstractDbRepository {
  abstract startSession(): Promise<ClientSession>;

  abstract exists(dataType: DataType, chainId: number, address: string, session?: ClientSession): Promise<boolean>;
  abstract existsBalance(chainId: number, address: string, user: string): Promise<boolean>;
  abstract existsEvent(
    chainId: number,
    address: string,
    blockNumber: number,
    txIndex: number,
    logIndex: number,
    session?: ClientSession,
  ): Promise<boolean>;

  abstract isUserBalancesLoaded(chainId: number, user: string): Promise<boolean>;

  abstract countEvents(chainId: number): Promise<number>;

  abstract get<T>(dataType: DataType, chainId: number, address: string, session?: ClientSession): Promise<T | null>;
  abstract getAllMatching<T extends IContract>(
    dataType: DataType,
    filter: Partial<T> & Pick<T, "chainId">,
  ): Promise<T[]>;
  abstract getDirectory(chainId: number): Promise<IDirectory | null>;
  abstract getInterfaceByChargedToken(chainId: number, ctAddress: string): Promise<IInterfaceProjectToken | null>;
  abstract getBalances(chainId: number, address: string, session?: ClientSession): Promise<IUserBalance[]>;
  abstract getBalance(
    chainId: number,
    address: string,
    user: string,
    session?: ClientSession,
  ): Promise<IUserBalance | null>;
  abstract getPTBalance(
    chainId: number,
    ptAddress: string,
    user: string,
    session?: ClientSession,
  ): Promise<string | null>;
  abstract getBalancesByProjectToken(
    chainId: number,
    ptAddress: string,
    user: string,
    session?: ClientSession,
  ): Promise<IUserBalance[]>;
  abstract getAllEvents(): Promise<IEvent[]>;
  abstract getEventsPaginated(chainId: number, count: number, offset: number): Promise<IEvent[]>;

  abstract isDelegableStillReferenced(chainId: number, address: string): Promise<boolean>;

  abstract save<T extends IContract>(dataType: DataType, data: T, session?: ClientSession): Promise<T>;
  abstract saveBalance(data: IUserBalance): Promise<void>;
  abstract saveEvent(data: IEvent): Promise<void>;

  abstract update<T extends IContract>(
    dataType: DataType,
    data: Partial<T> & Pick<IContract, "chainId" | "address" | "lastUpdateBlock">,
    session?: ClientSession,
  ): Promise<void>;
  abstract updateBalance(
    data: Partial<IUserBalance> & Pick<IUserBalance, "user" | "chainId" | "address" | "lastUpdateBlock">,
    session?: ClientSession,
  ): Promise<void>;
  abstract updateOtherBalancesByProjectToken(
    addressToExclude: string,
    data: Partial<IUserBalance> & Pick<IUserBalance, "user" | "chainId" | "lastUpdateBlock" | "ptAddress">,
    session?: ClientSession,
  ): Promise<void>;
  abstract updateEventStatus(
    event: Pick<IEvent, "chainId" | "address" | "blockNumber" | "txIndex" | "logIndex">,
    newStatus: EventHandlerStatus,
    session?: ClientSession,
  ): Promise<void>;

  abstract delete<T extends IContract>(
    dataType: DataType,
    chainId: number,
    address: string | string[],
    session?: ClientSession,
  ): Promise<void>;
  abstract deletePendingAndFailedEvents(chainId: number): Promise<void>;
}
