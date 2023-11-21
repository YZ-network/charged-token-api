import { Repeater } from "graphql-yoga";
import mongoose from "mongoose";
import { ChargedTokenModel, DelegableToLTModel, InterfaceProjectTokenModel } from "../../../models";
import pubSub from "../../pubsub";
import { ResolverFactory } from "../factory";

jest.mock("../../pubsub.ts");
jest.mock("../../../models");

describe("Generic query resolver factory", () => {
  it("should query for all items by chain id and convert results to graphQL format", async () => {
    const chainId = 129;
    const model = ChargedTokenModel;
    const findAllResolver = ResolverFactory.findAll(model);

    const loadedModels = [
      { chainId, address: "0xCT1" },
      { chainId, address: "0xCT2" },
    ];
    (model as any).find.mockResolvedValueOnce(loadedModels);
    (model as any).toGraphQL.mockImplementation((value: any) => value);

    const result = await findAllResolver(undefined, { chainId });

    expect(result).toStrictEqual(loadedModels);
    expect(model.find).toBeCalledWith({ chainId });
    expect(model.toGraphQL).toBeCalledTimes(loadedModels.length);
  });

  it("should query one item by chain id and address", async () => {
    const chainId = 129;
    const model = InterfaceProjectTokenModel;
    const findByAddressResolver = ResolverFactory.findByAddress(model);

    const address = "0xIFACE1";
    const loadedModel = { chainId, address };
    (model as any).findOne.mockResolvedValueOnce(loadedModel);
    (model as any).toGraphQL.mockImplementation((value: any) => value);

    const result = await findByAddressResolver(undefined, { chainId, address });

    expect(result).toStrictEqual(loadedModel);
    expect(model.findOne).toBeCalledWith({ chainId, address });
    expect(model.toGraphQL).toBeCalledWith(loadedModel);
  });

  it("should return nothing if item is not found", async () => {
    const chainId = 129;
    const model = DelegableToLTModel;
    const findByAddressResolver = ResolverFactory.findByAddress(model);

    const address = "0xIFACE1";
    (model as any).findOne.mockResolvedValueOnce(null);

    const result = await findByAddressResolver(undefined, { chainId, address });

    expect(result).toBeUndefined();
    expect(model.findOne).toBeCalledWith({ chainId, address });
    expect(model.toGraphQL).not.toBeCalled();
  });

  it("should susbscribe to channel by model name", async () => {
    const chainId = 129;
    const model = "SampleModel";
    const { subscribe: subscribeByNameResolver, resolve } = ResolverFactory.subscribeByName(model);

    expect(resolve("test")).toBe("test");

    const subscription = new Repeater(async (push, stop) => {
      await push("firstValue");
      await push("secondValue");
      await push("thirdValue");
      stop();
    });

    (pubSub as any).subscribe.mockReturnValueOnce(subscription);

    const modelMock = ChargedTokenModel;
    (mongoose as any).model.mockReturnValue(modelMock);
    (modelMock as any).findOne.mockResolvedValueOnce("zeroValue");
    (modelMock as any).toGraphQL.mockImplementationOnce((value: any) => value);

    const repeater = subscribeByNameResolver(undefined, { chainId });

    expect(repeater).toBeDefined();
    expect(repeater).toBeInstanceOf(Repeater);
    expect(pubSub.subscribe).toBeCalledWith(`${model}.${chainId}`);

    expect(await repeater.next()).toEqual({ value: "zeroValue", done: false });
    expect(await repeater.next()).toEqual({ value: "firstValue", done: false });
    expect(await repeater.next()).toEqual({ value: "secondValue", done: false });
    expect(await repeater.next()).toEqual({ value: "thirdValue", done: false });
    expect(await repeater.return()).toEqual({ done: true });

    expect(mongoose.model).toBeCalledWith(model);
    expect(modelMock.findOne).toBeCalledWith({ chainId });
    expect(modelMock.toGraphQL).toBeCalledTimes(1);
  });

  it("should susbscribe to channel by model name and contract address", async () => {
    const chainId = 129;
    const model = "SampleModel";
    const address = "0xCT";
    const { subscribe: subscribeByNameAndAddrResolver, resolve } = ResolverFactory.subscribeByNameAndAddress(model);

    expect(resolve("test")).toBe("test");

    const subscription = new Repeater(async (push, stop) => {
      await push("firstValue");
      await push("secondValue");
      await push("thirdValue");
      stop();
    });

    (pubSub as any).subscribe.mockReturnValueOnce(subscription);

    const modelMock = ChargedTokenModel;
    (mongoose as any).model.mockReturnValue(modelMock);
    (modelMock as any).findOne.mockResolvedValueOnce("zeroValue");
    (modelMock as any).toGraphQL.mockImplementationOnce((value: any) => value);

    const repeater = subscribeByNameAndAddrResolver(undefined, { chainId, address });

    expect(repeater).toBeDefined();
    expect(repeater).toBeInstanceOf(Repeater);
    expect(pubSub.subscribe).toBeCalledWith(`${model}.${chainId}.${address}`);

    expect(await repeater.next()).toEqual({ value: "zeroValue", done: false });
    expect(await repeater.next()).toEqual({ value: "firstValue", done: false });
    expect(await repeater.next()).toEqual({ value: "secondValue", done: false });
    expect(await repeater.next()).toEqual({ value: "thirdValue", done: false });
    expect(await repeater.return()).toEqual({ done: true });

    expect(mongoose.model).toBeCalledWith(model);
    expect(modelMock.findOne).toBeCalledWith({ chainId, address });
    expect(modelMock.toGraphQL).toBeCalledTimes(1);
  });
});
