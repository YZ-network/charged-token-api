import { Repeater } from "graphql-yoga";
import { ChargedTokenModel, UserBalanceModel } from "../../../models";
import pubSub from "../../pubsub";
import { UserBalanceQueryResolver, UserBalanceSubscriptionResolver } from "../userBalance";

jest.mock("../../../config");
jest.mock("../../pubsub");
jest.mock("../../../models");

describe("User balance query resolver", () => {
  const chainId = 129;
  const user = "0xUSER";
  const address = "0xADDRESS";

  it("should return cached balances by chain id and user", async () => {
    const loadedBalances = [
      { chainId, user, address: "0xCT1" },
      { chainId, user, address: "0xCT2" },
      { chainId, user, address: "0xCT3" },
    ];

    (ChargedTokenModel as any).count.mockResolvedValueOnce(3);
    (UserBalanceModel as any).count.mockResolvedValueOnce(3);
    (UserBalanceModel as any).find.mockResolvedValueOnce(loadedBalances);
    (UserBalanceModel as any).toGraphQL.mockImplementation((value: any) => value);

    const result = await UserBalanceQueryResolver(undefined, { chainId, user });

    expect(result).toStrictEqual(loadedBalances);
    expect(ChargedTokenModel.count).toBeCalledWith({ chainId });
    expect(UserBalanceModel.count).toBeCalledWith({ chainId, user });
    expect(UserBalanceModel.find).toBeCalledWith({ chainId, user });
    expect(UserBalanceModel.toGraphQL).toBeCalledTimes(3);
  });

  it("should notify for balances loading from blockchain if cached balances don't match contracts count", async () => {
    (ChargedTokenModel as any).count.mockResolvedValueOnce(3);
    (UserBalanceModel as any).count.mockResolvedValueOnce(2);

    const result = await UserBalanceQueryResolver(undefined, { chainId, user });

    expect(result).toStrictEqual([]);
    expect(ChargedTokenModel.count).toBeCalledWith({ chainId });
    expect(UserBalanceModel.count).toBeCalledWith({ chainId, user });
    expect(pubSub.publish).toBeCalledWith(`UserBalance.${chainId}/load`, { user });
  });

  it("should return specific cached balances when address is provided", async () => {
    const loadedBalance = { chainId, user, address: "0xCT1" };

    (UserBalanceModel as any).exists.mockResolvedValueOnce({});
    (UserBalanceModel as any).findOne.mockResolvedValueOnce(loadedBalance);
    (UserBalanceModel as any).toGraphQL.mockImplementation((value: any) => value);

    const result = await UserBalanceQueryResolver(undefined, { chainId, user, address });

    expect(result).toStrictEqual(loadedBalance);
    expect(UserBalanceModel.exists).toBeCalledWith({ chainId, user, address });
    expect(UserBalanceModel.findOne).toBeCalledWith({ chainId, user, address });
    expect(UserBalanceModel.toGraphQL).toBeCalledTimes(1);
  });

  it("should load balances from blockchain if not found when address is provided", async () => {
    (UserBalanceModel as any).exists.mockResolvedValueOnce(null);

    const result = await UserBalanceQueryResolver(undefined, { chainId, user, address });

    expect(result).toStrictEqual([]);
    expect(UserBalanceModel.exists).toBeCalledWith({ chainId, user, address });
    expect(pubSub.publish).toBeCalledWith(`UserBalance.${chainId}/load`, { user, address });
  });

  it("should subscribe to user balances updatess", async () => {
    const { subscribe: subscribeByUserAndAddrResolver, resolve } = UserBalanceSubscriptionResolver;

    expect(resolve("test")).toBe("test");

    const subscription = new Repeater(async (push, stop) => {
      await push("firstValue");
      await push("secondValue");
      await push("thirdValue");
      stop();
    });

    (pubSub as any).subscribe.mockReturnValueOnce(subscription);

    (UserBalanceModel as any).find.mockResolvedValueOnce(["zeroValue"]);
    (UserBalanceModel as any).toGraphQL.mockImplementation((value: any) => value);

    const repeater = subscribeByUserAndAddrResolver(undefined, { chainId, user });

    expect(repeater).toBeDefined();
    expect(repeater).toBeInstanceOf(Repeater);
    expect(pubSub.subscribe).toBeCalledWith(`UserBalance.${chainId}.${user}`);

    expect(await repeater.next()).toEqual({ value: ["zeroValue"], done: false });
    expect(await repeater.next()).toEqual({ value: "firstValue", done: false });
    expect(await repeater.next()).toEqual({ value: "secondValue", done: false });
    expect(await repeater.next()).toEqual({ value: "thirdValue", done: false });
    expect(await repeater.return()).toEqual({ done: true });

    expect(UserBalanceModel.find).toBeCalledWith({ chainId, user });
    expect(UserBalanceModel.toGraphQL).toBeCalledTimes(1);
  });
});
