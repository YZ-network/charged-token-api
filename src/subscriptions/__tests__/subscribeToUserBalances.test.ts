import { ClientSession } from "mongodb";
import mongoose from "mongoose";
import { AbstractBlockchainRepository, AbstractDbRepository } from "../../loaders";
import { Directory } from "../../loaders/Directory";
import { MockBlockchainRepository } from "../../loaders/__mocks__/MockBlockchainRepository";
import { MockDbRepository } from "../../loaders/__mocks__/MockDbRepository";
import pubSub from "../../pubsub";
import subscribeToUserBalancesLoading from "../subscribeToUserBalances";

jest.mock("../../globals/config");
jest.mock("../../pubsub");
jest.mock("../../loaders/Directory");

describe("User balances subscriptions", () => {
  let generatorCount = 0;

  let db: jest.Mocked<AbstractDbRepository>;
  let blockchain: jest.Mocked<AbstractBlockchainRepository>;

  beforeEach(() => {
    db = new MockDbRepository() as jest.Mocked<AbstractDbRepository>;
    blockchain = new MockBlockchainRepository() as jest.Mocked<AbstractBlockchainRepository>;
  });

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

    const directory = new Directory(1337, blockchain, "0xDIRECTORY", db);
    Object.defineProperty(directory, "chainId", { value: 1337 });
    Object.defineProperty(directory, "blockchain", { value: blockchain });

    blockchain.getBlockNumber.mockResolvedValue(15);

    const generatorInstance = generator();

    (pubSub as any).subscribe.mockReturnValueOnce(generatorInstance);

    const mockSession = new ClientSession();
    (mongoose as any).startSession.mockResolvedValue(mockSession);
    (mockSession as any).withTransaction.mockImplementation(async (fn: () => Promise<void>) => await fn());

    await subscribeToUserBalancesLoading(directory, blockchain);
    await waitForGeneratorToComplete(3);

    expect(blockchain.getBlockNumber).toBeCalledTimes(3);
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

    const directory = new Directory(1337, blockchain, "0xDIRECTORY", db);
    Object.defineProperty(directory, "chainId", { value: 1337 });
    Object.defineProperty(directory, "blockchain", { value: blockchain });

    blockchain.getBlockNumber.mockResolvedValueOnce(15);

    const generatorInstance = generator();

    (pubSub as any).subscribe.mockReturnValueOnce(generatorInstance);

    (mongoose as any).startSession.mockImplementation(async () => {
      throw new Error("triggered error");
    });

    await subscribeToUserBalancesLoading(directory, blockchain);
    await waitForGeneratorToComplete(1);

    expect(blockchain.getBlockNumber).toBeCalledTimes(1);
    expect(pubSub.subscribe).toHaveBeenNthCalledWith(1, "UserBalance.1337/load");
    expect(mongoose.startSession).toBeCalledTimes(1);
    expect(directory.loadAllUserBalances).not.toBeCalled();
  });
});
