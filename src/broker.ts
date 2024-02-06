import { Repeater, createPubSub } from "graphql-yoga";
import { AbstractBroker, DataType } from "./loaders";

const HEALTH_CHANNEL = "Health";

const pubSub = createPubSub();

export class Broker extends AbstractBroker {
  private getChannel(dataType: DataType, chainId: number, address?: string): string {
    return address !== undefined ? `${dataType}.${chainId}.${address}` : `${dataType}.${chainId}`;
  }

  private getBalanceLoadingChannel(chainId: number): string {
    return `${DataType.UserBalance}.${chainId}/load`;
  }

  notifyUpdate(dataType: DataType, chainId: number, address: string, data: any): void {
    pubSub.publish(this.getChannel(dataType, chainId, address), data);
    pubSub.publish(this.getChannel(dataType, chainId), data);
  }

  notifyBalanceLoadingRequired(chainId: number, data: any): void {
    pubSub.publish(this.getBalanceLoadingChannel(chainId), data);
  }

  notifyHealth(data: any): void {
    pubSub.publish(HEALTH_CHANNEL, data);
  }

  subscribeHealth(): Repeater<any> {
    return pubSub.subscribe(HEALTH_CHANNEL);
  }

  subscribeUpdates(dataType: DataType, chainId: number): Repeater<any> {
    return pubSub.subscribe(this.getChannel(dataType, chainId));
  }

  subscribeUpdatesByAddress(dataType: DataType, chainId: number, address: string): Repeater<any> {
    return pubSub.subscribe(this.getChannel(dataType, chainId, address));
  }

  subscribeBalanceLoadingRequests(chainId: number): Repeater<any> {
    return pubSub.subscribe(this.getBalanceLoadingChannel(chainId));
  }
}
