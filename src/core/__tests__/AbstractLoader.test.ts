import { ClientSession } from "mongodb";
import { AbstractBlockchainRepository } from "../AbstractBlockchainRepository";
import { AbstractBroker } from "../AbstractBroker";
import { AbstractDbRepository } from "../AbstractDbRepository";
import { ChargedToken } from "../ChargedToken";
import { Directory } from "../Directory";
import { MockBlockchainRepository } from "../__mocks__/MockBlockchainRepository";
import { MockBroker } from "../__mocks__/MockBroker";
import { MockDbRepository } from "../__mocks__/MockDbRepository";
import { DataType } from "../types";

jest.mock("../../globals/config");
jest.mock("../../topics");
jest.mock("../../db");

describe("AbstractLoader: common core features", () => {
  const CHAIN_ID = 1337;
  const ADDRESS = "0xADDRESS";

  let blockchain: jest.Mocked<AbstractBlockchainRepository>;
  let db: jest.Mocked<AbstractDbRepository>;
  let broker: jest.Mocked<AbstractBroker>;
  let directoryLoader: Directory;
  let ctLoader: ChargedToken;
  let session: ClientSession;

  beforeEach(() => {
    blockchain = new MockBlockchainRepository() as jest.Mocked<AbstractBlockchainRepository>;
    db = new MockDbRepository() as jest.Mocked<AbstractDbRepository>;
    broker = new MockBroker() as jest.Mocked<AbstractBroker>;
    directoryLoader = new Directory(CHAIN_ID, blockchain, ADDRESS, db, broker);
    ctLoader = new ChargedToken(CHAIN_ID, blockchain, ADDRESS, directoryLoader, db, broker);
    session = new ClientSession();
  });

  it("should load balances by project token address", async () => {
    await directoryLoader.getBalancesByProjectToken(session, "0xPT", "0xUSER");

    expect(db.getBalancesByProjectToken).toBeCalledWith(CHAIN_ID, "0xPT", "0xUSER");
  });

  it("should detect balances updates that trigger negative amounts", async () => {
    const ERROR_MSG = "Invalid update detected : negative amounts in user balance";

    const blockNumber = 15;

    await expect(
      directoryLoader.updateBalanceAndNotify(
        session,
        ADDRESS,
        "0xUSER",
        { balance: "-0" },
        blockNumber,
        undefined,
        "SampleEvent",
      ),
    ).rejects.toThrowError(ERROR_MSG);

    await expect(
      directoryLoader.updateBalanceAndNotify(
        session,
        ADDRESS,
        "0xUSER",
        { balancePT: "-0" },
        blockNumber,
        undefined,
        "SampleEvent",
      ),
    ).rejects.toThrowError(ERROR_MSG);

    await expect(
      directoryLoader.updateBalanceAndNotify(
        session,
        ADDRESS,
        "0xUSER",
        { fullyChargedBalance: "-0" },
        blockNumber,
        undefined,
        "SampleEvent",
      ),
    ).rejects.toThrowError(ERROR_MSG);

    await expect(
      directoryLoader.updateBalanceAndNotify(
        session,
        ADDRESS,
        "0xUSER",
        { partiallyChargedBalance: "-0" },
        blockNumber,
        undefined,
        "SampleEvent",
      ),
    ).rejects.toThrowError(ERROR_MSG);

    await expect(
      directoryLoader.updateBalanceAndNotify(
        session,
        ADDRESS,
        "0xUSER",
        { claimedRewardPerShare1e18: "-0" },
        blockNumber,
        undefined,
        "SampleEvent",
      ),
    ).rejects.toThrowError(ERROR_MSG);

    await expect(
      directoryLoader.updateBalanceAndNotify(
        session,
        ADDRESS,
        "0xUSER",
        { valueProjectTokenToFullRecharge: "-0" },
        blockNumber,
        undefined,
        "SampleEvent",
      ),
    ).rejects.toThrowError(ERROR_MSG);
  });

  it("should update user balances and notify", async () => {
    const blockNumber = 20;

    const jsonBalance = { balance: "15" } as any;
    const balanceUpdate = { ...jsonBalance } as any;

    const getBalance = jest.spyOn(directoryLoader, "getBalance").mockResolvedValue(balanceUpdate);

    await directoryLoader.updateBalanceAndNotify(
      session,
      ADDRESS,
      "0xUSER",
      balanceUpdate,
      blockNumber,
      undefined,
      "SampleEvent",
    );

    expect(db.updateBalance).toBeCalledWith({
      ...balanceUpdate,
      chainId: CHAIN_ID,
      address: ADDRESS,
      user: "0xUSER",
      lastUpdateBlock: blockNumber,
    });
    expect(getBalance).toBeCalledWith(session, ADDRESS, "0xUSER");
    expect(broker.notifyUpdate).toBeCalledWith(DataType.UserBalance, 1337, "0xUSER", [jsonBalance]);
  });

  it("should propagate changes to the PT balance and notify", async () => {
    const blockNumber = 20;

    const jsonBalance = { balancePT: "15" } as any;
    const balanceUpdate = { ...jsonBalance } as any;

    const getBalancesByPT = jest.spyOn(directoryLoader, "getBalancesByProjectToken").mockResolvedValue([balanceUpdate]);

    await directoryLoader.updateBalanceAndNotify(
      session,
      ADDRESS,
      "0xUSER",
      balanceUpdate,
      blockNumber,
      "0xPT",
      "SampleEvent",
    );

    expect(db.updateBalance).toBeCalledWith({
      ...balanceUpdate,
      chainId: CHAIN_ID,
      address: ADDRESS,
      user: "0xUSER",
      lastUpdateBlock: blockNumber,
    });
    expect(db.updateOtherBalancesByProjectToken).toBeCalledWith(ADDRESS, {
      ...jsonBalance,
      chainId: CHAIN_ID,
      user: "0xUSER",
      ptAddress: "0xPT",
      lastUpdateBlock: blockNumber,
    });
    expect(getBalancesByPT).toBeCalledWith(session, "0xPT", "0xUSER");
    expect(broker.notifyUpdate).toBeCalledWith(DataType.UserBalance, 1337, "0xUSER", [jsonBalance]);
  });
});