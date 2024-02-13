import { Repeater } from "graphql-yoga";
import { ClientSession } from "mongodb";
import mongoose from "mongoose";
import { AbstractBlockchainRepository } from "../../core/AbstractBlockchainRepository";
import { AbstractBroker } from "../../core/AbstractBroker";
import { AbstractDbRepository } from "../../core/AbstractDbRepository";
import { MockBlockchainRepository } from "../../core/__mocks__/MockBlockchainRepository";
import { MockBroker } from "../../core/__mocks__/MockBroker";
import { MockDbRepository } from "../../core/__mocks__/MockDbRepository";
import subscribeToUserBalancesLoading from "../subscribeToUserBalances";

jest.mock("../../config");

describe("User balances subscriptions", () => {
  let generatorCount = 0;

  let db: jest.Mocked<AbstractDbRepository>;
  let blockchain: jest.Mocked<AbstractBlockchainRepository>;
  let broker: jest.Mocked<AbstractBroker>;

  beforeEach(() => {
    db = new MockDbRepository() as jest.Mocked<AbstractDbRepository>;
    blockchain = new MockBlockchainRepository() as jest.Mocked<AbstractBlockchainRepository>;
    broker = new MockBroker() as jest.Mocked<AbstractBroker>;
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

    blockchain.getBlockNumber.mockResolvedValue(15);

    const generatorInstance = generator();

    broker.subscribeBalanceLoadingRequests.mockReturnValueOnce(generatorInstance as unknown as Repeater<any>);

    const mockSession = new ClientSession();
    (mongoose as any).startSession.mockResolvedValue(mockSession);
    (mockSession as any).withTransaction.mockImplementation(async (fn: () => Promise<void>) => await fn());

    await subscribeToUserBalancesLoading(1337, db, blockchain, broker);
    await waitForGeneratorToComplete(3);

    expect(blockchain.getBlockNumber).toBeCalledTimes(3);
    expect(broker.subscribeBalanceLoadingRequests).toHaveBeenCalledTimes(1);
    expect(mongoose.startSession).toBeCalledTimes(3);
    expect(mockSession.withTransaction).toBeCalledTimes(3);
    expect(mockSession.endSession).toBeCalledTimes(3);
  });

  it("should catch errors on user balances loading requests", async () => {
    generatorCount = 0;
    function* generator(): Generator<object> {
      yield { user: "0xUSER1", address: "0xADDR1" };
      generatorCount++;
    }

    blockchain.getBlockNumber.mockResolvedValueOnce(15);

    const generatorInstance = generator();

    broker.subscribeBalanceLoadingRequests.mockReturnValueOnce(generatorInstance as unknown as Repeater<any>);

    (mongoose as any).startSession.mockImplementation(async () => {
      throw new Error("triggered error");
    });

    await subscribeToUserBalancesLoading(1337, db, blockchain, broker);
    await waitForGeneratorToComplete(1);

    expect(blockchain.getBlockNumber).toBeCalledTimes(1);
    expect(broker.subscribeBalanceLoadingRequests).toHaveBeenNthCalledWith(1, 1337);
    expect(mongoose.startSession).toBeCalledTimes(1);
  });
});
