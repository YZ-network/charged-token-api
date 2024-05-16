import { Repeater } from "graphql-yoga";
import type { Logger } from "pino";
import { MockLogger } from "../../../__mocks__/MockLogger";
import type { AbstractBroker } from "../../../core/AbstractBroker";
import type { AbstractDbRepository } from "../../../core/AbstractDbRepository";
import { MockBroker } from "../../../core/__mocks__/MockBroker";
import { MockDbRepository } from "../../../core/__mocks__/MockDbRepository";
import { ResolverFactory } from "../factory";

describe("Generic query resolver factory", () => {
  let db: jest.Mocked<AbstractDbRepository>;
  let broker: jest.Mocked<AbstractBroker>;
  let log: jest.Mocked<Logger>;

  const chainId = 1337;

  beforeEach(() => {
    db = new MockDbRepository() as jest.Mocked<AbstractDbRepository>;
    broker = new MockBroker() as jest.Mocked<AbstractBroker>;
    log = new MockLogger() as jest.Mocked<Logger>;
  });

  it("should query for all items by chain id and convert results to graphQL format", async () => {
    const findAllResolver = ResolverFactory.findAll(db, "ChargedToken");

    const loadedModels = [
      { chainId, address: "0xCT1" },
      { chainId, address: "0xCT2" },
    ] as IContract[];
    db.getAllMatching.mockResolvedValueOnce(loadedModels);

    const result = await findAllResolver(undefined, { chainId });

    expect(result).toStrictEqual(loadedModels);
    expect(db.getAllMatching).toBeCalledWith("ChargedToken", { chainId });
  });

  it("should query one item by chain id and address", async () => {
    const findByAddressResolver = ResolverFactory.findByAddress(db, "InterfaceProjectToken");

    const address = "0xIFACE1";
    const loadedModel = { chainId, address } as IContract;
    db.get.mockResolvedValueOnce(loadedModel);

    const result = await findByAddressResolver(undefined, { chainId, address });

    expect(result).toStrictEqual(loadedModel);
    expect(db.get).toBeCalledWith("InterfaceProjectToken", chainId, address);
  });

  it("should return nothing if item is not found", async () => {
    const findByAddressResolver = ResolverFactory.findByAddress(db, "DelegableToLT");

    const address = "0xIFACE1";
    db.get.mockResolvedValueOnce(null);

    const result = await findByAddressResolver(undefined, { chainId, address });

    expect(result).toBeUndefined();
    expect(db.get).toBeCalledWith("DelegableToLT", chainId, address);
  });

  it("should susbscribe to channel by model name", async () => {
    const { subscribe: subscribeByNameResolver, resolve } = ResolverFactory.subscribeByName(
      db,
      broker,
      log,
      "ChargedToken",
    );

    expect(resolve("test")).toBe("test");

    const subscription = new Repeater(async (push, stop) => {
      await push({ address: "0x1" });
      await push({ address: "0x2" });
      await push({ address: "0x3" });
      stop();
    });

    broker.subscribeUpdates.mockReturnValueOnce(subscription);

    db.getAllMatching.mockResolvedValueOnce([{ address: "0x0" }] as IContract[]);

    const repeater = subscribeByNameResolver(undefined, { chainId });

    expect(repeater).toBeDefined();
    expect(repeater).toBeInstanceOf(Repeater);
    expect(broker.subscribeUpdates).toBeCalledWith("ChargedToken", chainId);

    expect(await repeater.next()).toEqual({ value: { address: "0x0" }, done: false });
    expect(await repeater.next()).toEqual({ value: { address: "0x1" }, done: false });
    expect(await repeater.next()).toEqual({ value: { address: "0x2" }, done: false });
    expect(await repeater.next()).toEqual({ value: { address: "0x3" }, done: false });
    expect(await repeater.return()).toEqual({ done: true });

    expect(db.getAllMatching).toBeCalledWith("ChargedToken", { chainId });
  });

  it("should susbscribe to channel by model name and contract address", async () => {
    const address = "0xCT";
    const { subscribe: subscribeByNameAndAddrResolver, resolve } = ResolverFactory.subscribeByNameAndAddress(
      db,
      broker,
      log,
      "ChargedToken",
    );

    expect(resolve("test")).toBe("test");

    const subscription = new Repeater(async (push, stop) => {
      await push({ address: "0x0", supply: "1" });
      await push({ address: "0x0", supply: "2" });
      await push({ address: "0x0", supply: "3" });
      stop();
    });

    broker.subscribeUpdatesByAddress.mockReturnValueOnce(subscription);

    db.get.mockResolvedValueOnce({ address: "0x0", supply: "0" });

    const repeater = subscribeByNameAndAddrResolver(undefined, { chainId, address });

    expect(repeater).toBeDefined();
    expect(repeater).toBeInstanceOf(Repeater);
    expect(broker.subscribeUpdatesByAddress).toBeCalledWith("ChargedToken", chainId, address);

    expect(await repeater.next()).toEqual({ value: { address: "0x0", supply: "0" }, done: false });
    expect(await repeater.next()).toEqual({ value: { address: "0x0", supply: "1" }, done: false });
    expect(await repeater.next()).toEqual({ value: { address: "0x0", supply: "2" }, done: false });
    expect(await repeater.next()).toEqual({ value: { address: "0x0", supply: "3" }, done: false });
    expect(await repeater.return()).toEqual({ done: true });

    expect(db.get).toBeCalledWith("ChargedToken", chainId, address);
  });
});
