import { Repeater, createPubSub } from "graphql-yoga";
import { AbstractBroker } from "./core/AbstractBroker";
import { Metrics } from "./metrics";
import { rootLogger } from "./rootLogger";

export class Broker extends AbstractBroker {
  readonly log;

  readonly pubSub;
  private subId;
  private subscriptions: Record<number, Repeater<any, any, unknown>[]>;

  constructor() {
    super();

    this.log = rootLogger.child({ name: "Broker" });

    this.pubSub = createPubSub();
    this.subId = 0;
    this.subscriptions = {};
  }

  notifyUpdate(dataType: DataType, chainId: number, address: string, data: any): void {
    this.pubSub.publish(this.getChannel(dataType, chainId, address), data);
    this.pubSub.publish(this.getChannel(dataType, chainId), data);
  }

  notifyBalanceLoadingRequired(chainId: number, data: any): void {
    this.pubSub.publish(this.getBalanceLoadingChannel(chainId), data);
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

  private getChannel(dataType: DataType, chainId: number, address?: string): string {
    return address !== undefined ? `${dataType}.${chainId}.${address}` : `${dataType}.${chainId}`;
  }

  private getBalanceLoadingChannel(chainId: number): string {
    return `${"UserBalance"}.${chainId}/load`;
  }

  private subscribe(channel: string, chainId: number): Repeater<any, any, unknown> {
    const subId = ++this.subId;
    const sub = this.pubSub.subscribe(channel);
    (sub as any).id = subId;

    this.log.info({ chainId, msg: "subscribed to broker channel", channel, subId });

    if (this.subscriptions[chainId] === undefined) {
      this.subscriptions[chainId] = [];
    }
    this.subscriptions[chainId].push(sub);
    this.updateSubscriptionsCount(chainId);

    return sub;
  }

  private updateSubscriptionsCount(chainId: number) {
    if (this.subscriptions[chainId] !== undefined) {
      Metrics.setGqlSubscriptionCount(chainId, this.subscriptions[chainId].length);
    }
  }

  async unsubscribe(sub: Repeater<any, any, unknown>, chainId: number): Promise<void> {
    const subId = (sub as any).id;
    const index = this.subscriptions[chainId].findIndex((s) => (s as any).id === subId);

    if (index >= 0) {
      this.subscriptions[chainId].splice(index, 1);
      await sub.return();
      this.log.info({ chainId, msg: "subscription closed.", subId });
    } else {
      this.log.warn({ chainId, msg: "tried to remove missing subscription !", subId, subs: this.subscriptions });
    }
  }

  async removeSubscriptions(chainId: number) {
    await Promise.all(this.subscriptions[chainId].map((sub) => sub.return()));

    this.log.info({ chainId, msg: "closed all subscriptions", count: this.subscriptions[chainId].length });

    this.subscriptions[chainId] = [];
    this.updateSubscriptionsCount(chainId);
  }
}
