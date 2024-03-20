import { Repeater, createPubSub } from "graphql-yoga";
import { AbstractBroker } from "./core/AbstractBroker";

const HEALTH_CHANNEL = "Health";

export class Broker extends AbstractBroker {
  readonly pubSub = createPubSub();

  private getChannel(dataType: DataType, chainId: number, address?: string): string {
    return address !== undefined ? `${dataType}.${chainId}.${address}` : `${dataType}.${chainId}`;
  }

  private getBalanceLoadingChannel(chainId: number): string {
    return `${"UserBalance"}.${chainId}/load`;
  }

  notifyUpdate(dataType: DataType, chainId: number, address: string, data: any): void {
    this.pubSub.publish(this.getChannel(dataType, chainId, address), data);
    this.pubSub.publish(this.getChannel(dataType, chainId), data);
  }

  notifyBalanceLoadingRequired(chainId: number, data: any): void {
    this.pubSub.publish(this.getBalanceLoadingChannel(chainId), data);
  }

  notifyHealth(data: any): void {
    this.pubSub.publish(HEALTH_CHANNEL, data);
  }

  subscribeHealth(): Repeater<any> {
    return this.pubSub.subscribe(HEALTH_CHANNEL);
  }

  subscribeUpdates(dataType: DataType, chainId: number): Repeater<any> {
    return this.pubSub.subscribe(this.getChannel(dataType, chainId));
  }

  subscribeUpdatesByAddress(dataType: DataType, chainId: number, address: string): Repeater<any> {
    return this.pubSub.subscribe(this.getChannel(dataType, chainId, address));
  }

  subscribeBalanceLoadingRequests(chainId: number): Repeater<any> {
    return this.pubSub.subscribe(this.getBalanceLoadingChannel(chainId));
  }
}
