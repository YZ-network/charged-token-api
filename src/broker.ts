import { Repeater, createPubSub } from "graphql-yoga";
import { AbstractBroker } from "./core/AbstractBroker";
import { Metrics } from "./metrics";
import { rootLogger } from "./rootLogger";

const HEALTH_CHANNEL = "Health";

export class Broker extends AbstractBroker {
  readonly pubSub = createPubSub();
  readonly log = rootLogger.child({ name: "Broker" });
  private subId = 0;

  private subscriptions: Record<number, Repeater<any, any, unknown>[]> = {};

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
    return this.subscribe(HEALTH_CHANNEL);
  }

  subscribeUpdates(dataType: DataType, chainId: number): Repeater<any> {
    return this.subscribe(this.getChannel(dataType, chainId), chainId);
  }

  subscribeUpdatesByAddress(dataType: DataType, chainId: number, address: string): Repeater<any> {
    return this.subscribe(this.getChannel(dataType, chainId, address), chainId);
  }

  subscribeBalanceLoadingRequests(chainId: number): Repeater<any> {
    return this.subscribe(this.getBalanceLoadingChannel(chainId), chainId);
  }

  private subscribe(channel: string, chainId: number = 0): Repeater<any, any, unknown> {
    this.log.info({ chainId, msg: "subscribing to broker channel", channel });
    const sub = this.pubSub.subscribe(channel);
    (sub as any).id = ++this.subId;
    if (this.subscriptions[chainId] === undefined) {
      this.subscriptions[chainId] = [];
    }
    this.subscriptions[chainId].push(sub);
    this.log.info({ chainId, msg: "subscribed to broker channel", channel, sub, subs: this.subscriptions });
    this.updateSubscriptionsCount(chainId);
    return sub;
  }

  private updateSubscriptionsCount(chainId: number) {
    if (this.subscriptions[chainId] !== undefined) {
      Metrics.setGqlSubscriptionCount(chainId, this.subscriptions[chainId].length);
    }
  }

  async unsubscribe(sub: Repeater<any, any, unknown>, chainId: number = 0): Promise<void> {
    const index = this.subscriptions[chainId].findIndex((s) => (s as any).id === (sub as any).id);
    if (index >= 0) {
      this.subscriptions[chainId].splice(index, 1);
      await sub.return();
      this.log.info({ chainId, msg: "subscription closed." });
    } else {
      this.log.warn({ chainId, msg: "tried to remove missing subscription !", sub, subs: this.subscriptions });
    }
  }

  async destroy(chainId: number = 0) {
    if (chainId !== 0) {
      this.log.info({ chainId, msg: "closing subscriptions", count: this.subscriptions[chainId].length });
      await Promise.all(this.subscriptions[chainId].map((sub) => sub.return()));
      this.subscriptions[chainId] = [];
    } else {
      const subs = Object.values(this.subscriptions).flatMap((sub) => sub);
      this.log.info({ chainId, msg: "closing subscriptions", count: subs.length });
      await Promise.all(subs.map((sub) => sub.return()));
      this.subscriptions = {};
    }
    this.updateSubscriptionsCount(chainId);
  }
}
