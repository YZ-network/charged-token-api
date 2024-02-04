import { ClientSession } from "mongodb";
import mongoose from "mongoose";
import { pubSub } from "../../graphql";
import { Directory } from "../../loaders/Directory";
import { type EventListener } from "../../loaders/EventListener";
import { MockDbRepository } from "../../loaders/__mocks__/MockDbRepository";
import { type AutoWebSocketProvider } from "../../util";
import subscribeToUserBalancesLoading from "../subscribeToUserBalances";

jest.mock("../../globals/config");
jest.mock("../../graphql");
jest.mock("../../loaders/Directory");

describe("User balances subscriptions", () => {
  let generatorCount = 0;

  async function waitForGeneratorToComplete(count: number) {
    return new Promise((resolve, reject) => {
      const interval = setInterval(() => {
        if (generatorCount >= count) {
          clearTimeout(timeout);
          clearInterval(interval);
          resolve(undefined);
        }
      }, 1);

      const timeout = setTimeout(() => {
        clearInterval(interval);
        reject(Error("Timeout reached !"));
      }, 500);
    });
  }

  it("should subscribe to user balances loading requests", async () => {
    generatorCount = 0;
    function* generator(): Generator<object> {
      yield { user: "0xUSER1", address: "0xADDR1" };
      generatorCount++;
      yield { user: "0xUSER2", address: "0xADDR2" };
      generatorCount++;
      yield { user: "0xUSER3" };
      generatorCount++;
    }

    const getBlockNumber = jest.fn();
    const directory = new Directory(
      undefined as unknown as EventListener,
      1337,
      undefined as unknown as AutoWebSocketProvider,
      "0xDIRECTORY",
      new MockDbRepository(),
    );
    Object.defineProperty(directory, "chainId", { value: 1337 });
    Object.defineProperty(directory, "provider", { value: { getBlockNumber } });

    getBlockNumber.mockResolvedValue(15);

    const generatorInstance = generator();

    (pubSub as any).subscribe.mockReturnValueOnce(generatorInstance);

    const mockSession = new ClientSession();
    (mongoose as any).startSession.mockResolvedValue(mockSession);
    (mockSession as any).withTransaction.mockImplementation(async (fn: () => Promise<void>) => await fn());

    await subscribeToUserBalancesLoading(directory);
    await waitForGeneratorToComplete(3);

    expect(getBlockNumber).toBeCalledTimes(3);
    expect(pubSub.subscribe).toHaveBeenNthCalledWith(1, "UserBalance.1337/load");
    expect(mongoose.startSession).toBeCalledTimes(3);
    expect(mockSession.withTransaction).toBeCalledTimes(3);
    expect(mockSession.endSession).toBeCalledTimes(3);
    expect(directory.loadAllUserBalances).toHaveBeenNthCalledWith(1, mockSession, "0xUSER1", 15, "0xADDR1");
    expect(directory.loadAllUserBalances).toHaveBeenNthCalledWith(2, mockSession, "0xUSER2", 15, "0xADDR2");
    expect(directory.loadAllUserBalances).toHaveBeenNthCalledWith(3, mockSession, "0xUSER3", 15, undefined);
  });

  it("should catch errors on user balances loading requests", async () => {
    generatorCount = 0;
    function* generator(): Generator<object> {
      yield { user: "0xUSER1", address: "0xADDR1" };
      generatorCount++;
    }

    const getBlockNumber = jest.fn();
    const directory = new Directory(
      undefined as unknown as EventListener,
      1337,
      undefined as unknown as AutoWebSocketProvider,
      "0xDIRECTORY",
      new MockDbRepository(),
    );
    Object.defineProperty(directory, "chainId", { value: 1337 });
    Object.defineProperty(directory, "provider", { value: { getBlockNumber } });

    getBlockNumber.mockImplementation(async () => 15);

    const generatorInstance = generator();

    (pubSub as any).subscribe.mockReturnValueOnce(generatorInstance);

    (mongoose as any).startSession.mockImplementation(async () => {
      throw new Error("triggered error");
    });

    await subscribeToUserBalancesLoading(directory);
    await waitForGeneratorToComplete(1);

    expect(getBlockNumber).toBeCalledTimes(1);
    expect(pubSub.subscribe).toHaveBeenNthCalledWith(1, "UserBalance.1337/load");
    expect(mongoose.startSession).toBeCalledTimes(1);
    expect(directory.loadAllUserBalances).not.toBeCalled();
  });
});
