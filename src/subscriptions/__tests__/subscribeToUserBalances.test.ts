import { Repeater } from "graphql-yoga";
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

    blockchain.getLastState.mockResolvedValue(null);
    blockchain.loadUserBalances
      .mockResolvedValueOnce({ user: "0xUSER1", address: "0xADDR1" } as IUserBalance)
      .mockResolvedValueOnce({ user: "0xUSER2", address: "0xADDR2" } as IUserBalance);

    await subscribeToUserBalancesLoading(1337, db, blockchain, broker);
    await waitForGeneratorToComplete(3);

    expect(broker.subscribeBalanceLoadingRequests).toHaveBeenCalledTimes(1);

    expect(blockchain.getBlockNumber).toBeCalledTimes(3);
    expect(blockchain.getLastState).toBeCalledTimes(2);
    expect(blockchain.loadUserBalances).toHaveBeenNthCalledWith(1, 15, "0xUSER1", "0xADDR1", undefined, undefined);
    expect(blockchain.loadUserBalances).toHaveBeenNthCalledWith(2, 15, "0xUSER2", "0xADDR2", undefined, undefined);
    expect(db.saveBalance).toHaveBeenNthCalledWith(1, { user: "0xUSER1", address: "0xADDR1" });
    expect(db.saveBalance).toHaveBeenNthCalledWith(2, { user: "0xUSER2", address: "0xADDR2" });
    expect(blockchain.loadAllUserBalances).toBeCalledWith("0xUSER3", 15);
  });

  it("should reload user balances when requested", async () => {
    generatorCount = 0;
    function* generator(): Generator<object> {
      yield { user: "0xUSER1", address: "0xCT" };
      generatorCount++;
    }

    blockchain.getBlockNumber.mockResolvedValue(15);

    const generatorInstance = generator();

    broker.subscribeBalanceLoadingRequests.mockReturnValueOnce(generatorInstance as unknown as Repeater<any>);

    blockchain.getLastState
      .mockResolvedValueOnce({ address: "0xCT", interfaceProjectToken: "0xIFACE" })
      .mockResolvedValueOnce({ projectToken: "0xPT" });

    blockchain.loadUserBalances.mockResolvedValueOnce({
      user: "0xUSER1",
      address: "0xCT",
      ptAddress: "0xPT",
    } as IUserBalance);

    await subscribeToUserBalancesLoading(1337, db, blockchain, broker);
    await waitForGeneratorToComplete(1);

    expect(broker.subscribeBalanceLoadingRequests).toBeCalled();
    expect(blockchain.getBlockNumber).toBeCalled();
    expect(blockchain.getLastState).toHaveBeenNthCalledWith(1, "ChargedToken", "0xCT");
    expect(blockchain.getLastState).toHaveBeenNthCalledWith(2, "InterfaceProjectToken", "0xIFACE");
    expect(blockchain.loadUserBalances).toBeCalledWith(15, "0xUSER1", "0xCT", "0xIFACE", "0xPT");
    expect(db.saveBalance).toBeCalledWith({
      user: "0xUSER1",
      address: "0xCT",
      ptAddress: "0xPT",
    });
  });
});
