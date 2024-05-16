import type { Repeater } from "graphql-yoga";
import { createPubSub } from "graphql-yoga";
import { Broker } from "../broker";

jest.mock("../config");

describe("Broker", () => {
  const CHAIN_ID = 1337;

  let broker: Broker;

  beforeEach(() => {
    broker = new Broker();
  });

  it("should notify update by address and by contract type", async () => {
    expect(createPubSub).toBeCalled();

    const data = { address: "0xADDRESS" } as IChargedToken;

    await broker.notifyUpdate("ChargedToken", CHAIN_ID, "0xADDRESS", data);

    expect(broker.pubSub.publish).toBeCalledWith("ChargedToken.1337.0xADDRESS", data);
    expect(broker.pubSub.publish).toBeCalledWith("ChargedToken.1337", data);
  });

  it("should notify worker to load balances", async () => {
    const data = { user: "0xUSER", address: "0xADDRESS" };

    await broker.notifyBalanceLoadingRequired(CHAIN_ID, data);

    expect(broker.pubSub.publish).toBeCalledWith("UserBalance.1337/load", data);
  });

  it("should subscribe to contract updates by address and by contract type", async () => {
    await broker.subscribeUpdatesByAddress("ChargedToken", CHAIN_ID, "0xADDRESS");

    expect(broker.pubSub.subscribe).toBeCalledWith("ChargedToken.1337.0xADDRESS");
  });

  it("should subscribe to contract updates by contract type", async () => {
    await broker.subscribeUpdates("ChargedToken", CHAIN_ID);

    expect(broker.pubSub.subscribe).toBeCalledWith("ChargedToken.1337");
  });

  it("should subscribe to balance loading requests", async () => {
    await broker.subscribeBalanceLoadingRequests(CHAIN_ID);

    expect(broker.pubSub.subscribe).toBeCalledWith("UserBalance.1337/load");
  });

  it("should unsubscribe from given sub", async () => {
    const sub = broker.subscribeUpdates("ChargedToken", CHAIN_ID);
    expect(broker.getSubscriptions()[CHAIN_ID]).toContain(sub);

    await broker.unsubscribe(sub, CHAIN_ID);

    expect(broker.getSubscriptions()[CHAIN_ID]).not.toContain(sub);
    expect(sub.return).toBeCalled();
  });

  it("should not fail when unsubscribing from ended sub", async () => {
    const sub = { id: 0, channel: "anyChannel", return: jest.fn() } as unknown as Repeater<any, any, unknown>;

    await broker.unsubscribe(sub, CHAIN_ID);

    expect(sub.return).not.toBeCalled();
  });

  it("should remove all remaining subscriptions", async () => {
    broker.subscribeUpdates("ChargedToken", CHAIN_ID);
    broker.subscribeUpdates("InterfaceProjectToken", CHAIN_ID);
    expect(broker.getSubscriptions()[CHAIN_ID].length).toEqual(2);

    await broker.removeSubscriptions(CHAIN_ID);

    expect(broker.getSubscriptions()[CHAIN_ID].length).toEqual(0);
  });
});
