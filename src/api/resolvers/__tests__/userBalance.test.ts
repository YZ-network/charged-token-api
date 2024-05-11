import { Repeater } from "graphql-yoga";
import { Logger } from "pino";
import { MockLogger } from "../../../__mocks__/MockLogger";
import { AbstractBroker } from "../../../core/AbstractBroker";
import { AbstractDbRepository } from "../../../core/AbstractDbRepository";
import { MockBroker } from "../../../core/__mocks__/MockBroker";
import { MockDbRepository } from "../../../core/__mocks__/MockDbRepository";
import {
  UserBalanceQueryResolver,
  UserBalanceQueryResolverFactory,
  UserBalanceSubscriptionResolverFactory,
} from "../userBalance";

jest.mock("../../../config");

describe("User balance query resolver", () => {
  const chainId = 1337;
  const user = "0xUSER";
  const address = "0xADDRESS";

  let db: jest.Mocked<AbstractDbRepository>;
  let broker: jest.Mocked<AbstractBroker>;
  let log: jest.Mocked<Logger>;
  let resolver: UserBalanceQueryResolver;

  beforeEach(() => {
    db = new MockDbRepository() as jest.Mocked<AbstractDbRepository>;
    broker = new MockBroker() as jest.Mocked<AbstractBroker>;
    log = new MockLogger() as jest.Mocked<Logger>;
    resolver = UserBalanceQueryResolverFactory(db, broker, log);
  });

  it("should return cached balances by chain id and user", async () => {
    const loadedBalances = [
      { chainId, user, address: "0xCT1" },
      { chainId, user, address: "0xCT2" },
      { chainId, user, address: "0xCT3" },
    ] as IUserBalance[];

    db.isUserBalancesLoaded.mockResolvedValueOnce(true);
    db.getBalances.mockResolvedValueOnce(loadedBalances);

    const result = await resolver(undefined, { chainId, user });

    expect(result).toStrictEqual(loadedBalances);
    expect(db.isUserBalancesLoaded).toBeCalledWith(chainId, user);
    expect(db.getBalances).toBeCalledWith(chainId, user);
  });

  it("should notify for balances loading from blockchain if cached balances don't match contracts count", async () => {
    db.isUserBalancesLoaded.mockResolvedValueOnce(false);

    const result = await resolver(undefined, { chainId, user });

    expect(result).toStrictEqual([]);
    expect(db.isUserBalancesLoaded).toBeCalledWith(chainId, user);
    expect(broker.notifyBalanceLoadingRequired).toBeCalledWith(chainId, { user });
  });

  it("should return specific cached balance when address is provided", async () => {
    const loadedBalance = { chainId, user, address: "0xCT1" } as IUserBalance;

    db.isUserBalancesLoaded.mockResolvedValueOnce(true);
    db.getBalance.mockResolvedValueOnce(loadedBalance);

    const result = await resolver(undefined, { chainId, user, address });

    expect(result).toStrictEqual(loadedBalance);
    expect(db.isUserBalancesLoaded).toBeCalledWith(chainId, user);
    expect(db.getBalance).toBeCalledWith(chainId, address, user);
  });

  it("should return null when address is provided and the balance haven't been loaded yet", async () => {
    const loadedBalance = { chainId, user, address: "0xCT1" } as IUserBalance;

    db.isUserBalancesLoaded.mockResolvedValueOnce(true);
    db.getBalance.mockResolvedValueOnce(null);

    const result = await resolver(undefined, { chainId, user, address });

    expect(result).toStrictEqual(null);
    expect(db.isUserBalancesLoaded).toBeCalledWith(chainId, user);
    expect(db.getBalance).toBeCalledWith(chainId, address, user);
  });

  it("should load balances from blockchain if not found when address is provided", async () => {
    db.isUserBalancesLoaded.mockResolvedValueOnce(false);

    const result = await resolver(undefined, { chainId, user, address });

    expect(result).toStrictEqual(null);
    expect(db.isUserBalancesLoaded).toBeCalledWith(chainId, user);
    expect(broker.notifyBalanceLoadingRequired).toBeCalledWith(chainId, { user, address });
  });

  it("should subscribe to user balances updatess", async () => {
    const { subscribe: subscribeByUserAndAddrResolver, resolve } = UserBalanceSubscriptionResolverFactory(
      db,
      broker,
      log,
    );

    expect(resolve("test")).toBe("test");

    const subscription = new Repeater(async (push, stop) => {
      await push("firstValue");
      await push("secondValue");
      await push("thirdValue");
      stop();
    });

    broker.subscribeUpdatesByAddress.mockReturnValueOnce(subscription);

    db.getBalances.mockResolvedValueOnce(["zeroValue"] as unknown[] as IUserBalance[]);

    const repeater = subscribeByUserAndAddrResolver(undefined, { chainId, user });

    expect(repeater).toBeDefined();
    expect(repeater).toBeInstanceOf(Repeater);
    expect(broker.subscribeUpdatesByAddress).toBeCalledWith("UserBalance", chainId, user);

    expect(await repeater.next()).toEqual({ value: ["zeroValue"], done: false });
    expect(await repeater.next()).toEqual({ value: "firstValue", done: false });
    expect(await repeater.next()).toEqual({ value: "secondValue", done: false });
    expect(await repeater.next()).toEqual({ value: "thirdValue", done: false });
    expect(await repeater.return()).toEqual({ done: true });

    expect(db.getBalances).toBeCalledWith(chainId, user);
  });
});
