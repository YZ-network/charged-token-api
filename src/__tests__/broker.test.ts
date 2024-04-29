import { createPubSub } from "graphql-yoga";
import { Broker } from "../broker";

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
});
