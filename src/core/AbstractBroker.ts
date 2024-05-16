import type { Repeater } from "graphql-yoga";

export abstract class AbstractBroker {
  abstract notifyUpdate(dataType: DataType, chainId: number, address: string, data: any): void;
  abstract notifyBalanceLoadingRequired(chainId: number, data: any): void;

  abstract subscribeUpdates(dataType: DataType, chainId: number): Repeater<any>;
  abstract subscribeUpdatesByAddress(dataType: DataType, chainId: number, address: string): Repeater<any>;
  abstract subscribeBalanceLoadingRequests(chainId: number): Repeater<any>;

  abstract unsubscribe(sub: Repeater<any>, chainId?: number): Promise<void>;
  abstract removeSubscriptions(chainId: number): Promise<void>;
}
