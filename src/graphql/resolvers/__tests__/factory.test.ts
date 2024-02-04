import { Repeater } from "graphql-yoga";
import { AbstractDbRepository } from "../../../loaders/AbstractDbRepository";
import { MockDbRepository } from "../../../loaders/__mocks__/MockDbRepository";
import { DataType, IContract } from "../../../types";
import pubSub from "../../pubsub";
import { ResolverFactory } from "../factory";

jest.mock("../../pubsub.ts");
jest.mock("../../../models");

describe("Generic query resolver factory", () => {
  let db: jest.Mocked<AbstractDbRepository>;

  beforeEach(() => {
    db = new MockDbRepository() as jest.Mocked<AbstractDbRepository>;
  });

  it("should query for all items by chain id and convert results to graphQL format", async () => {
    const chainId = 129;
    const findAllResolver = ResolverFactory.findAll(db, DataType.ChargedToken);

    const loadedModels = [
      { chainId, address: "0xCT1" },
      { chainId, address: "0xCT2" },
    ] as IContract[];
    db.getAllMatching.mockResolvedValueOnce(loadedModels);

    const result = await findAllResolver(undefined, { chainId });

    expect(result).toStrictEqual(loadedModels);
    expect(db.getAllMatching).toBeCalledWith(DataType.ChargedToken, { chainId });
  });

  it("should query one item by chain id and address", async () => {
    const chainId = 129;
    const findByAddressResolver = ResolverFactory.findByAddress(db, DataType.InterfaceProjectToken);

    const address = "0xIFACE1";
    const loadedModel = { chainId, address } as IContract;
    db.get.mockResolvedValueOnce(loadedModel);

    const result = await findByAddressResolver(undefined, { chainId, address });

    expect(result).toStrictEqual(loadedModel);
    expect(db.get).toBeCalledWith(DataType.InterfaceProjectToken, chainId, address);
  });

  it("should return nothing if item is not found", async () => {
    const chainId = 129;
    const findByAddressResolver = ResolverFactory.findByAddress(db, DataType.DelegableToLT);

    const address = "0xIFACE1";
    db.get.mockResolvedValueOnce(null);

    const result = await findByAddressResolver(undefined, { chainId, address });

    expect(result).toBeUndefined();
    expect(db.get).toBeCalledWith(DataType.DelegableToLT, chainId, address);
  });

  it("should susbscribe to channel by model name", async () => {
    const chainId = 129;
    const { subscribe: subscribeByNameResolver, resolve } = ResolverFactory.subscribeByName(db, DataType.ChargedToken);

    expect(resolve("test")).toBe("test");

    const subscription = new Repeater(async (push, stop) => {
      await push("firstValue");
      await push("secondValue");
      await push("thirdValue");
      stop();
    });

    (pubSub as any).subscribe.mockReturnValueOnce(subscription);

    db.getAllMatching.mockResolvedValueOnce("zeroValue" as unknown as IContract[]);

    const repeater = subscribeByNameResolver(undefined, { chainId });

    expect(repeater).toBeDefined();
    expect(repeater).toBeInstanceOf(Repeater);
    expect(pubSub.subscribe).toBeCalledWith(`${DataType.ChargedToken}.${chainId}`);

    expect(await repeater.next()).toEqual({ value: "zeroValue", done: false });
    expect(await repeater.next()).toEqual({ value: "firstValue", done: false });
    expect(await repeater.next()).toEqual({ value: "secondValue", done: false });
    expect(await repeater.next()).toEqual({ value: "thirdValue", done: false });
    expect(await repeater.return()).toEqual({ done: true });

    expect(db.getAllMatching).toBeCalledWith(DataType.ChargedToken, { chainId });
  });

  it("should susbscribe to channel by model name and contract address", async () => {
    const chainId = 129;
    const address = "0xCT";
    const { subscribe: subscribeByNameAndAddrResolver, resolve } = ResolverFactory.subscribeByNameAndAddress(
      db,
      DataType.ChargedToken,
    );

    expect(resolve("test")).toBe("test");

    const subscription = new Repeater(async (push, stop) => {
      await push("firstValue");
      await push("secondValue");
      await push("thirdValue");
      stop();
    });

    (pubSub as any).subscribe.mockReturnValueOnce(subscription);

    db.get.mockResolvedValueOnce("zeroValue");

    const repeater = subscribeByNameAndAddrResolver(undefined, { chainId, address });

    expect(repeater).toBeDefined();
    expect(repeater).toBeInstanceOf(Repeater);
    expect(pubSub.subscribe).toBeCalledWith(`${DataType.ChargedToken}.${chainId}.${address}`);

    expect(await repeater.next()).toEqual({ value: "zeroValue", done: false });
    expect(await repeater.next()).toEqual({ value: "firstValue", done: false });
    expect(await repeater.next()).toEqual({ value: "secondValue", done: false });
    expect(await repeater.next()).toEqual({ value: "thirdValue", done: false });
    expect(await repeater.return()).toEqual({ done: true });

    expect(db.get).toBeCalledWith(DataType.ChargedToken, chainId, address);
  });
});
