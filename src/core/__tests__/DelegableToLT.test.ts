import { ClientSession } from "mongodb";
import { FlattenMaps } from "mongoose";
import { EMPTY_ADDRESS } from "../../vendor";
import { AbstractBlockchainRepository } from "../AbstractBlockchainRepository";
import { AbstractBroker } from "../AbstractBroker";
import { AbstractDbRepository } from "../AbstractDbRepository";
import { ChargedToken } from "../ChargedToken";
import { DelegableToLT } from "../DelegableToLT";
import { Directory } from "../Directory";
import { MockBlockchainRepository } from "../__mocks__/MockBlockchainRepository";
import { MockBroker } from "../__mocks__/MockBroker";
import { MockDbRepository } from "../__mocks__/MockDbRepository";

jest.mock("../../config");
jest.mock("../../topics");
jest.mock("../../api");
jest.mock("../../db");
jest.mock("../Directory");
jest.mock("../ChargedToken");

describe("DelegableToLT loader", () => {
  const CHAIN_ID = 1337;
  const OWNER = "0x493942A95Bc6Db03CE8Cc22ff5a0441Dcc581f45";
  const ADDRESS = "0xF79A6c67E99b2135E09C3Ba0d06AE60977C1f393";
  const NAME = "Test CT";
  const SYMBOL = "TCT";

  let blockchain: jest.Mocked<AbstractBlockchainRepository>;
  let db: jest.Mocked<AbstractDbRepository>;
  let broker: jest.Mocked<AbstractBroker>;
  let directoryLoader: Directory;
  let ctLoader: ChargedToken;
  let loader: DelegableToLT;
  let session: ClientSession;

  beforeEach(() => {
    blockchain = new MockBlockchainRepository() as jest.Mocked<AbstractBlockchainRepository>;
    db = new MockDbRepository() as jest.Mocked<AbstractDbRepository>;
    broker = new MockBroker() as jest.Mocked<AbstractBroker>;
    directoryLoader = new Directory(CHAIN_ID, blockchain, ADDRESS, db, broker);
    ctLoader = new ChargedToken(CHAIN_ID, blockchain, ADDRESS, directoryLoader, db, broker);
    Object.defineProperty(ctLoader, "address", { value: ADDRESS });
    loader = new DelegableToLT(CHAIN_ID, blockchain, ADDRESS, directoryLoader, ctLoader, db, broker);
    session = new ClientSession();
  });

  test("Should initialize DelegableToLT by reading blockchain when not in db", async () => {
    // checking constructor
    expect(loader.chainId).toBe(CHAIN_ID);
    expect(loader.directory).toBe(directoryLoader);
    expect(loader.ct).toBe(ctLoader);
    expect(loader.address).toBe(ADDRESS);
    expect(loader.lastState).toEqual(undefined);

    // mocking ethers
    const BLOCK_NUMBER = 15;

    blockchain.getBlockNumber.mockResolvedValueOnce(BLOCK_NUMBER);

    // mocking mongo model
    const graphqlModel = {
      chainId: CHAIN_ID,
      initBlock: BLOCK_NUMBER,
      lastUpdateBlock: BLOCK_NUMBER,
      address: ADDRESS,
      owner: OWNER,
      name: NAME,
      symbol: SYMBOL,
      decimals: "18",
      totalSupply: "1",
      validatedInterfaceProjectToken: ["0xADDR"],
      isListOfInterfaceProjectTokenComplete: false,
    };

    db.get.mockResolvedValueOnce(null).mockResolvedValueOnce(graphqlModel);

    // mocking contract instance
    blockchain.loadDelegableToLT.mockResolvedValueOnce({
      chainId: CHAIN_ID,
      address: ADDRESS,
      lastUpdateBlock: BLOCK_NUMBER,
      owner: OWNER,
      name: NAME,
      symbol: SYMBOL,
      decimals: "18",
      totalSupply: "1",
      validatedInterfaceProjectToken: ["0xADDR"],
      isListOfInterfaceProjectTokenComplete: false,
    });

    // tested function
    await loader.init(session, BLOCK_NUMBER, true);

    // expectations
    expect(loader.lastState).toEqual(graphqlModel);

    expect(db.get).toHaveBeenNthCalledWith(2, "DelegableToLT", CHAIN_ID, ADDRESS);
    expect(db.save).toHaveBeenCalledTimes(1);

    expect(blockchain.loadDelegableToLT).toBeCalledTimes(1);
    expect(blockchain.loadAndSyncEvents).toBeCalledTimes(0);

    expect((session as any).startTransaction).toBeCalledTimes(1);
    expect((session as any).commitTransaction).toBeCalledTimes(1);
  });

  test("Should use events to update existing DelegableToLT from db", async () => {
    // mocking ethers
    const PREV_BLOCK_NUMBER = 15;
    const BLOCK_NUMBER = 20;

    blockchain.getBlockNumber.mockResolvedValueOnce(BLOCK_NUMBER);

    // mocking mongo model
    const loadedModel = {
      chainId: CHAIN_ID,
      initBlock: PREV_BLOCK_NUMBER,
      lastUpdateBlock: PREV_BLOCK_NUMBER,
      address: ADDRESS,
      owner: OWNER,
      name: NAME,
      symbol: SYMBOL,
      decimals: "18",
      totalSupply: "1",
      validatedInterfaceProjectToken: ["0xADDR"],
      isListOfInterfaceProjectTokenComplete: false,
    };

    db.get.mockResolvedValueOnce(loadedModel);

    // tested function
    await loader.init(session, BLOCK_NUMBER, true);

    // expectations
    expect(loader.lastState).toEqual(loadedModel);

    expect(db.get).toHaveBeenNthCalledWith(1, "DelegableToLT", CHAIN_ID, ADDRESS);
    expect(db.save).toHaveBeenCalledTimes(0);

    expect(blockchain.loadDelegableToLT).toBeCalledTimes(0);
    expect(blockchain.loadAndSyncEvents).toBeCalledTimes(1);

    expect(loader.lastState).toEqual(loadedModel);

    expect((session as any).startTransaction).toBeCalledTimes(1);
    expect((session as any).commitTransaction).toBeCalledTimes(1);
  });

  // Event Handlers
  test("AddedInterfaceProjectToken", async () => {
    const blockNumber = 15;

    const loadedModel = {
      validatedInterfaceProjectToken: ["0xIF1", "0xIF2"],
    };
    const getJsonModel = jest
      .spyOn(loader, "getJsonModel")
      .mockResolvedValueOnce(loadedModel as FlattenMaps<IDelegableToLT>);
    const applyUpdateAndNotify = jest.spyOn(loader, "applyUpdateAndNotify").mockResolvedValueOnce(undefined);

    await loader.onAddedInterfaceProjectTokenEvent(
      session,
      ["0xNEW_INTERFACE"],
      blockNumber,
      "AddedInterfaceProjectToken",
    );

    expect(getJsonModel).toBeCalled();
    expect(applyUpdateAndNotify).toHaveBeenCalledWith(
      session,
      {
        validatedInterfaceProjectToken: ["0xIF1", "0xIF2", "0xNEW_INTERFACE"],
      },
      blockNumber,
      "AddedInterfaceProjectToken",
    );
  });

  test("ListOfValidatedInterfaceProjectTokenIsFinalized", async () => {
    const blockNumber = 15;

    const applyUpdateAndNotify = jest.spyOn(loader, "applyUpdateAndNotify").mockResolvedValueOnce(undefined);

    await loader.onListOfValidatedInterfaceProjectTokenIsFinalizedEvent(
      session,
      [],
      blockNumber,
      "ListOfValidatedInterfaceProjectTokenIsFinalized",
    );

    expect(applyUpdateAndNotify).toHaveBeenCalledWith(
      session,
      {
        isListOfInterfaceProjectTokenComplete: true,
      },
      blockNumber,
      "ListOfValidatedInterfaceProjectTokenIsFinalized",
    );
  });

  test("InterfaceProjectTokenRemoved", async () => {
    const blockNumber = 15;

    const loadedModel = {
      validatedInterfaceProjectToken: ["0xIF1", "0xIF2REMOVE", "0xIF3"],
    };
    const getJsonModel = jest
      .spyOn(loader, "getJsonModel")
      .mockResolvedValueOnce(loadedModel as FlattenMaps<IDelegableToLT>);
    const applyUpdateAndNotify = jest.spyOn(loader, "applyUpdateAndNotify").mockResolvedValueOnce(undefined);

    await loader.onInterfaceProjectTokenRemovedEvent(
      session,
      ["0xIF2REMOVE"],
      blockNumber,
      "InterfaceProjectTokenRemoved",
    );

    expect(getJsonModel).toBeCalled();
    expect(applyUpdateAndNotify).toHaveBeenCalledWith(
      session,
      {
        validatedInterfaceProjectToken: ["0xIF1", "0xIF3"],
      },
      blockNumber,
      "InterfaceProjectTokenRemoved",
    );
  });

  // Transfer use cases
  test("Transfer: empty value should do nothing", async () => {
    await loader.onTransferEvent(session, ["0xFROM", "0xTO", "0"], 15, "Transfer");
  });

  test("Transfer: p2p transfers should update both balances", async () => {
    const blockNumber = 15;

    const fromBalance = { balancePT: "150" } as any;
    const toBalance = { balancePT: "60" } as any;
    const getBalance = jest
      .spyOn(loader, "getBalance")
      .mockResolvedValueOnce(fromBalance)
      .mockResolvedValueOnce(toBalance);
    const updateBalance = jest.spyOn(loader, "updateBalanceAndNotify").mockResolvedValue(undefined);

    await loader.onTransferEvent(session, ["0xFROM", "0xTO", "10"], blockNumber, "Transfer");

    expect(getBalance).toHaveBeenNthCalledWith(1, session, ADDRESS, "0xFROM");
    expect(updateBalance).toHaveBeenNthCalledWith(
      1,
      session,
      ADDRESS,
      "0xFROM",
      { balancePT: "140" },
      blockNumber,
      ADDRESS,
      "Transfer",
    );
    expect(getBalance).toHaveBeenNthCalledWith(2, session, ADDRESS, "0xTO");
    expect(updateBalance).toHaveBeenNthCalledWith(
      2,
      session,
      ADDRESS,
      "0xTO",
      { balancePT: "70" },
      blockNumber,
      ADDRESS,
      "Transfer",
    );
  });

  test("Transfer: mint should increase user balance and totalSupply", async () => {
    const blockNumber = 15;

    const userBalance = { balancePT: "60" } as any;
    const getBalance = jest.spyOn(loader, "getBalance").mockResolvedValueOnce(userBalance);
    const contract = { totalSupply: "1000" } as any;
    const getJsonModel = jest.spyOn(loader, "getJsonModel").mockResolvedValue(contract);
    const updateBalance = jest.spyOn(loader, "updateBalanceAndNotify").mockResolvedValue(undefined);
    const updateContract = jest.spyOn(loader, "applyUpdateAndNotify").mockResolvedValue(undefined);

    await loader.onTransferEvent(session, [EMPTY_ADDRESS, "0xTO", "10"], blockNumber, "Transfer");

    expect(getBalance).toHaveBeenNthCalledWith(1, session, ADDRESS, "0xTO");
    expect(updateBalance).toHaveBeenNthCalledWith(
      1,
      session,
      ADDRESS,
      "0xTO",
      { balancePT: "70" },
      blockNumber,
      ADDRESS,
      "Transfer",
    );
    expect(getJsonModel).toHaveBeenCalledWith(session);
    expect(updateContract).toHaveBeenCalledWith(session, { totalSupply: "1010" }, blockNumber, "Transfer");
  });

  test("Transfer: burn should decrease user balance and totalSupply", async () => {
    const blockNumber = 15;

    const userBalance = { balancePT: "60" } as any;
    const getBalance = jest.spyOn(loader, "getBalance").mockResolvedValueOnce(userBalance);
    const contract = { totalSupply: "1000" } as any;
    const getJsonModel = jest.spyOn(loader, "getJsonModel").mockResolvedValue(contract);
    const updateBalance = jest.spyOn(loader, "updateBalanceAndNotify").mockResolvedValue(undefined);
    const updateContract = jest.spyOn(loader, "applyUpdateAndNotify").mockResolvedValue(undefined);

    await loader.onTransferEvent(session, ["0xFROM", EMPTY_ADDRESS, "10"], blockNumber, "Transfer");

    expect(getBalance).toHaveBeenNthCalledWith(1, session, ADDRESS, "0xFROM");
    expect(updateBalance).toHaveBeenNthCalledWith(
      1,
      session,
      ADDRESS,
      "0xFROM",
      { balancePT: "50" },
      blockNumber,
      ADDRESS,
      "Transfer",
    );
    expect(getJsonModel).toHaveBeenCalledWith(session);
    expect(updateContract).toHaveBeenCalledWith(session, { totalSupply: "990" }, blockNumber, "Transfer");
  });

  // extraneous events

  test("Approval", async () => {
    // does nothing
    await loader.onApprovalEvent(session, [], 15, "Approval");
  });

  test("AddedAllTimeValidatedInterfaceProjectToken", async () => {
    // does nothing
    await loader.onAddedAllTimeValidatedInterfaceProjectTokenEvent(
      session,
      [],
      15,
      "AddedAllTimeValidatedInterfaceProjectToken",
    );
  });
});
