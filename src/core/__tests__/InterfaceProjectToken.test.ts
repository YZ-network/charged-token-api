import { BigNumber, ethers } from "ethers";
import { ClientSession } from "mongodb";
import { EMPTY_ADDRESS } from "../../vendor";
import { AbstractBlockchainRepository } from "../AbstractBlockchainRepository";
import { AbstractBroker } from "../AbstractBroker";
import { AbstractDbRepository } from "../AbstractDbRepository";
import { MockBlockchainRepository } from "../__mocks__/MockBlockchainRepository";
import { MockBroker } from "../__mocks__/MockBroker";
import { MockDbRepository } from "../__mocks__/MockDbRepository";
import { ChargedToken } from "../handlers/ChargedToken";
import { DelegableToLT } from "../handlers/DelegableToLT";
import { Directory } from "../handlers/Directory";
import { InterfaceProjectToken } from "../handlers/InterfaceProjectToken";

jest.mock("../../config");
jest.mock("../../blockchain/topics");
jest.mock("../Directory");
jest.mock("../ChargedToken");
jest.mock("../DelegableToLT");

describe("InterfaceProjectToken loader", () => {
  const CHAIN_ID = 1337;
  const OWNER = "0x493942A95Bc6Db03CE8Cc22ff5a0441Dcc581f45";
  const ADDRESS = "0xF79A6c67E99b2135E09C3Ba0d06AE60977C1f393";
  const BLOCK_NUMBER = 15;
  const PT_ADDRESS = "0xPT";

  let blockchain: jest.Mocked<AbstractBlockchainRepository>;
  let db: jest.Mocked<AbstractDbRepository>;
  let broker: jest.Mocked<AbstractBroker>;
  let directoryLoader: Directory;
  let ctLoader: ChargedToken;
  let loader: InterfaceProjectToken;
  let session: ClientSession;

  beforeEach(() => {
    Object.defineProperty(InterfaceProjectToken, "subscribedProjects", { value: [] });
    Object.defineProperty(InterfaceProjectToken, "projectInstances", { value: {} });
    Object.defineProperty(InterfaceProjectToken, "projectUsageCount", { value: {} });

    blockchain = new MockBlockchainRepository() as jest.Mocked<AbstractBlockchainRepository>;
    db = new MockDbRepository() as jest.Mocked<AbstractDbRepository>;
    broker = new MockBroker() as jest.Mocked<AbstractBroker>;
    directoryLoader = new Directory(CHAIN_ID, blockchain, ADDRESS, db, broker);
    ctLoader = new ChargedToken(CHAIN_ID, blockchain, ADDRESS, directoryLoader, db, broker);
    loader = new InterfaceProjectToken(CHAIN_ID, blockchain, ADDRESS, directoryLoader, ctLoader, db, broker);
    session = new ClientSession();
  });

  function sampleData() {
    return {
      chainId: CHAIN_ID,
      initBlock: BLOCK_NUMBER,
      lastUpdateBlock: BLOCK_NUMBER,
      address: ADDRESS,
      owner: OWNER,
      liquidityToken: "0xLT",
      projectToken: PT_ADDRESS,
      dateLaunch: "1",
      dateEndCliff: "2",
      claimFeesPerThousandForPT: "3",
    };
  }

  test("Should initialize InterfaceProjectToken by reading blockchain when not in db", async () => {
    // checking constructor
    expect(loader.chainId).toBe(CHAIN_ID);
    expect(loader.directory).toBe(directoryLoader);
    expect(loader.ct).toBe(ctLoader);
    expect(loader.address).toBe(ADDRESS);
    expect(loader.lastState).toEqual(undefined);

    // mocking ethers
    blockchain.getBlockNumber.mockResolvedValueOnce(BLOCK_NUMBER);

    // mocking mongo model
    const graphqlModel = {
      chainId: CHAIN_ID,
      initBlock: BLOCK_NUMBER,
      lastUpdateBlock: BLOCK_NUMBER,
      address: ADDRESS,
      owner: OWNER,
      liquidityToken: "0xLT",
      projectToken: "0xPT",
      dateLaunch: "1",
      dateEndCliff: "2",
      claimFeesPerThousandForPT: "3",
    };

    db.get.mockResolvedValueOnce(null).mockResolvedValueOnce(graphqlModel);

    // mocking contract instance
    blockchain.loadInterfaceProjectToken.mockResolvedValueOnce({
      chainId: CHAIN_ID,
      address: ADDRESS,
      lastUpdateBlock: BLOCK_NUMBER,
      owner: OWNER,
      liquidityToken: "0xLT",
      projectToken: EMPTY_ADDRESS,
      dateLaunch: "1",
      dateEndCliff: "2",
      claimFeesPerThousandForPT: "3",
    });

    // tested function
    await loader.init(session, BLOCK_NUMBER, true);

    // expectations
    expect(loader.lastState).toEqual(graphqlModel);

    expect(db.get).toBeCalledTimes(2);
    expect(db.get).toHaveBeenNthCalledWith(2, "InterfaceProjectToken", CHAIN_ID, ADDRESS);
    expect(db.save).toHaveBeenCalledTimes(1);

    expect(loader.projectToken).toBeDefined();
    expect(loader.projectToken?.init).toBeCalledTimes(1);

    expect(blockchain.loadInterfaceProjectToken).toBeCalledTimes(1);
    expect(blockchain.loadAndSyncEvents).toBeCalledTimes(0);

    expect((session as any).startTransaction).toBeCalledTimes(1);
    expect((session as any).commitTransaction).toBeCalledTimes(1);
  });

  test("Should use events to update existing InterfaceProjectToken from db", async () => {
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
      liquidityToken: "0xLT",
      projectToken: EMPTY_ADDRESS,
      dateLaunch: "1",
      dateEndCliff: "2",
      claimFeesPerThousandForPT: "3",
    };

    db.get.mockResolvedValueOnce(loadedModel);

    // tested function
    await loader.init(session, BLOCK_NUMBER, true);

    // expectations
    expect(loader.lastState).toEqual(loadedModel);

    expect(db.get).toHaveBeenNthCalledWith(1, "InterfaceProjectToken", CHAIN_ID, ADDRESS);
    expect(db.save).toHaveBeenCalledTimes(0);

    expect(loader.projectToken).toBeDefined();
    expect(loader.projectToken?.init).toBeCalledTimes(1);

    expect(blockchain.loadInterfaceProjectToken).toBeCalledTimes(0);
    expect(blockchain.loadAndSyncEvents).toBeCalledTimes(1);

    expect(loader.lastState).toEqual(loadedModel);

    expect((session as any).startTransaction).toBeCalledTimes(1);
    expect((session as any).commitTransaction).toBeCalledTimes(1);
  });

  test("Should initialize project token when not available", async () => {
    // mocking ethers
    const BLOCK_NUMBER = 20;

    blockchain.getBlockNumber.mockResolvedValueOnce(BLOCK_NUMBER);

    // mocking mongo model
    const PT_ADDRESS = "0xPT";
    const loadedModel = {
      chainId: CHAIN_ID,
      initBlock: BLOCK_NUMBER,
      lastUpdateBlock: BLOCK_NUMBER,
      address: ADDRESS,
      owner: OWNER,
      liquidityToken: "0xLT",
      projectToken: PT_ADDRESS,
      dateLaunch: "1",
      dateEndCliff: "2",
      claimFeesPerThousandForPT: "3",
    };

    db.get.mockResolvedValueOnce(loadedModel);

    // tested function
    await loader.init(session, BLOCK_NUMBER, true);
    loader.subscribeToEvents();

    // expectations
    expect(loader.projectToken).toBeDefined();
    expect(loader.skipProjectUpdates).toBe(false);
    expect(loader.projectToken?.init).toBeCalledTimes(1);
    expect(loader.projectToken?.subscribeToEvents).toBeCalledTimes(1);
    expect(blockchain.subscribeToEvents).toHaveBeenNthCalledWith(
      1,
      "InterfaceProjectToken",
      ADDRESS,
      expect.anything(),
    );
    expect(InterfaceProjectToken.projectInstances[PT_ADDRESS]).toBe(loader.projectToken);
    expect(InterfaceProjectToken.projectUsageCount[PT_ADDRESS]).toBe(0);
    expect(InterfaceProjectToken.subscribedProjects).toContain(PT_ADDRESS);
  });

  test("Should use existing project token if available", async () => {
    // preparing existing mock
    const PT_ADDRESS = "0xPT";
    const ptLoader = new DelegableToLT(CHAIN_ID, blockchain, PT_ADDRESS, directoryLoader, ctLoader, db, broker);
    InterfaceProjectToken.projectInstances[PT_ADDRESS] = ptLoader;
    InterfaceProjectToken.projectUsageCount[PT_ADDRESS] = 0;
    InterfaceProjectToken.subscribedProjects.push(PT_ADDRESS);

    // mocking ethers
    const BLOCK_NUMBER = 20;

    blockchain.getBlockNumber.mockResolvedValueOnce(BLOCK_NUMBER);

    // mocking mongo model
    const loadedModel = {
      chainId: CHAIN_ID,
      initBlock: BLOCK_NUMBER,
      lastUpdateBlock: BLOCK_NUMBER,
      address: ADDRESS,
      owner: OWNER,
      liquidityToken: "0xLT",
      projectToken: PT_ADDRESS,
      dateLaunch: "1",
      dateEndCliff: "2",
      claimFeesPerThousandForPT: "3",
    };

    db.get.mockResolvedValueOnce(loadedModel);

    // tested function
    await loader.init(session, BLOCK_NUMBER, true);
    loader.subscribeToEvents();

    // expectations
    expect(loader.projectToken).toBeDefined();
    expect(loader.skipProjectUpdates).toBe(true);
    expect(loader.projectToken?.init).not.toBeCalled();
    expect(loader.projectToken?.subscribeToEvents).not.toBeCalled();
    expect(blockchain.subscribeToEvents).toHaveBeenNthCalledWith(
      1,
      "InterfaceProjectToken",
      ADDRESS,
      expect.anything(),
    );
    expect(loader.projectToken).toBe(ptLoader);
    expect(InterfaceProjectToken.projectInstances[PT_ADDRESS]).toBe(ptLoader);
    expect(InterfaceProjectToken.projectUsageCount[PT_ADDRESS]).toBe(1);
    expect(InterfaceProjectToken.subscribedProjects).toContain(PT_ADDRESS);
  });

  test("should update all matching balances with project token address and PT balance", async () => {
    const balancesToUpdate = [
      { address: "0xCT", user: "0xUSER1", ptAddress: "0xPT" },
      { address: "0xCT", user: "0xUSER2", ptAddress: "0xPT" },
    ] as IUserBalance[];
    db.getBalances.mockResolvedValueOnce(balancesToUpdate);

    blockchain.getUserBalancePT.mockResolvedValueOnce("1").mockResolvedValueOnce("2");

    const updateBalance = jest.spyOn(loader, "updateBalanceAndNotify").mockResolvedValue(undefined);

    await loader.setProjectTokenAddressOnBalances(session, "0xCT", "0xPT", BLOCK_NUMBER);

    expect(db.getBalances).toHaveBeenNthCalledWith(1, CHAIN_ID, "0xCT");
    expect(blockchain.getUserBalancePT).toHaveBeenNthCalledWith(1, "0xPT", "0xUSER1");
    expect(blockchain.getUserBalancePT).toHaveBeenNthCalledWith(2, "0xPT", "0xUSER2");
    expect(updateBalance).toHaveBeenNthCalledWith(
      1,
      session,
      "0xCT",
      "0xUSER1",
      { ptAddress: "0xPT", balancePT: "1" },
      BLOCK_NUMBER,
    );
    expect(updateBalance).toHaveBeenNthCalledWith(
      2,
      session,
      "0xCT",
      "0xUSER2",
      { ptAddress: "0xPT", balancePT: "2" },
      BLOCK_NUMBER,
    );
  });

  // Event handlers
  test("StartSet", async () => {
    const loadedModel = sampleData();

    db.get.mockResolvedValueOnce(loadedModel);
    db.exists.mockResolvedValueOnce(true);

    const dateLaunch = BigNumber.from("10");
    const dateEndCliff = BigNumber.from("20");

    await loader.onStartSetEvent(session, [dateLaunch, dateEndCliff], BLOCK_NUMBER, "StartSet");

    expect(db.get).toBeCalledTimes(1);
    expect(db.exists).toBeCalledTimes(1);
    expect(db.update).toHaveBeenCalledWith("InterfaceProjectToken", {
      chainId: CHAIN_ID,
      address: ADDRESS,
      lastUpdateBlock: BLOCK_NUMBER,
      dateLaunch: dateLaunch.toString(),
      dateEndCliff: dateEndCliff.toString(),
    });

    expect(broker.notifyUpdate).toHaveBeenCalledWith("InterfaceProjectToken", CHAIN_ID, ADDRESS, loadedModel);
  });

  test("ProjectTokenReceived", async () => {
    // does nothing
    await loader.onProjectTokenReceivedEvent(session, [], BLOCK_NUMBER, "ProjectTokenReceived");
  });

  test("IncreasedValueProjectTokenToFullRecharge", async () => {
    const ctContract = new ethers.Contract("", []);

    Object.defineProperty(ctLoader, "address", { value: "0xCT" });
    Object.defineProperty(ctLoader, "instance", { value: ctContract });

    const balance = {
      valueProjectTokenToFullRecharge: "100",
    } as IUserBalance;
    db.getBalance.mockResolvedValueOnce(balance);
    blockchain.getUserLiquiToken.mockResolvedValueOnce({ dateOfPartiallyCharged: 150 });
    const updateBalance = jest.spyOn(loader, "updateBalanceAndNotify").mockResolvedValue(undefined);

    await loader.onIncreasedValueProjectTokenToFullRechargeEvent(
      session,
      ["0xUSER", "100"],
      BLOCK_NUMBER,
      "IncreasedValueProjectTokenToFullRecharge",
    );

    expect(db.getBalance).toBeCalledTimes(1);
    expect(updateBalance).toHaveBeenNthCalledWith(
      1,
      session,
      "0xCT",
      "0xUSER",
      {
        valueProjectTokenToFullRecharge: "200",
        dateOfPartiallyCharged: "150",
      },
      BLOCK_NUMBER,
      undefined,
      "IncreasedValueProjectTokenToFullRecharge",
    );
  });

  test("LTRecharged", async () => {
    Object.defineProperty(ctLoader, "address", { value: "0xCT" });

    const balance = {
      valueProjectTokenToFullRecharge: "150",
    } as any;

    const getBalance = jest.spyOn(loader, "getBalance").mockResolvedValueOnce(balance);
    const updateBalance = jest.spyOn(loader, "updateBalanceAndNotify").mockResolvedValueOnce(undefined);

    await loader.onLTRechargedEvent(session, ["0xUSER", "999", "50", "777"], BLOCK_NUMBER, "LTRecharged");

    expect(getBalance).toBeCalledTimes(1);
    expect(updateBalance).toHaveBeenNthCalledWith(
      1,
      session,
      "0xCT",
      "0xUSER",
      {
        valueProjectTokenToFullRecharge: "100",
      },
      BLOCK_NUMBER,
      undefined,
      "LTRecharged",
    );
  });

  test("ClaimFeesUpdated", async () => {
    const applyUpdateAndNotify = jest.spyOn(loader, "applyUpdateAndNotify").mockResolvedValueOnce(undefined);

    await loader.onClaimFeesUpdatedEvent(session, ["1234"], BLOCK_NUMBER, "ClaimFeesUpdated");

    expect(applyUpdateAndNotify).toHaveBeenNthCalledWith(
      1,
      session,
      {
        claimFeesPerThousandForPT: "1234",
      },
      BLOCK_NUMBER,
      "ClaimFeesUpdated",
    );
  });
});
