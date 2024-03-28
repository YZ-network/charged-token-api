import { BigNumber, ethers } from "ethers";
import { ClientSession } from "mongodb";
import { AbstractBroker } from "../../core/AbstractBroker";
import { AbstractDbRepository } from "../../core/AbstractDbRepository";
import { AbstractHandler } from "../../core/AbstractHandler";
import { MockBroker } from "../../core/__mocks__/MockBroker";
import { MockDbRepository } from "../../core/__mocks__/MockDbRepository";
import { EMPTY_ADDRESS } from "../../vendor";
import { BlockchainRepository } from "../BlockchainRepository";
import { EventListener } from "../EventListener";
import { detectNegativeAmount } from "../functions";
import { loadContract } from "../loaders";

jest.mock("../topics");
jest.mock("../functions");
jest.mock("../loaders");
jest.mock("../EventListener");
jest.mock("../../config");

describe("BlockchainRepository", () => {
  const CHAIN_ID = 1337;

  let provider: jest.Mocked<ethers.providers.JsonRpcProvider>;
  let db: jest.Mocked<AbstractDbRepository>;
  let broker: jest.Mocked<AbstractBroker>;
  let blockchain: BlockchainRepository;
  let session: ClientSession;

  beforeEach(() => {
    provider = new ethers.providers.JsonRpcProvider() as jest.Mocked<ethers.providers.JsonRpcProvider>;
    db = new MockDbRepository() as jest.Mocked<AbstractDbRepository>;
    broker = new MockBroker() as jest.Mocked<AbstractBroker>;
    blockchain = new BlockchainRepository(CHAIN_ID, provider, db, broker, false);
    session = new ClientSession();
  });

  it("should create contract instance if needed and cache it", () => {
    const firstInstances = {
      "0xCT1": blockchain.getInstance("ChargedToken", "0xCT1"),
      "0xCT2": blockchain.getInstance("ChargedToken", "0xCT2"),
      InterfaceProjectToken: blockchain.getInstance("InterfaceProjectToken", "0xIF"),
      Directory: blockchain.getInstance("Directory", "0xDIR"),
      DelegableToLT: blockchain.getInstance("DelegableToLT", "0xPT"),
    };

    expect(firstInstances).toBeDefined();

    const secondInstances = {
      "0xCT1": blockchain.getInstance("ChargedToken", "0xCT1"),
      "0xCT2": blockchain.getInstance("ChargedToken", "0xCT2"),
      InterfaceProjectToken: blockchain.getInstance("InterfaceProjectToken", "0xIF"),
      Directory: blockchain.getInstance("Directory", "0xDIR"),
      DelegableToLT: blockchain.getInstance("DelegableToLT", "0xPT"),
    };

    expect(secondInstances).toStrictEqual(firstInstances);
  });

  it("should throw for invalid contract types", () => {
    expect(() => blockchain.getInstance("UserBalance", "0xUSER")).toThrow();
  });

  it("should create contract interface if needed and cache it", () => {
    const firstInstances = {
      ChargedToken: blockchain.getInterface("ChargedToken"),
      InterfaceProjectToken: blockchain.getInterface("InterfaceProjectToken"),
      Directory: blockchain.getInterface("Directory"),
      DelegableToLT: blockchain.getInterface("DelegableToLT"),
    };

    expect(firstInstances).toBeDefined();

    const secondInstances = {
      ChargedToken: blockchain.getInterface("ChargedToken"),
      InterfaceProjectToken: blockchain.getInterface("InterfaceProjectToken"),
      Directory: blockchain.getInterface("Directory"),
      DelegableToLT: blockchain.getInterface("DelegableToLT"),
    };

    expect(secondInstances).toStrictEqual(firstInstances);
  });

  it("should throw for invalid contract types", () => {
    expect(() => blockchain.getInterface("UserBalance")).toThrow();
  });

  it("should return last contract state from db", async () => {
    const stubContract = {} as IChargedToken;

    db.get.mockResolvedValueOnce(stubContract);

    const result = await blockchain.getLastState("ChargedToken", "0xCT", session);

    expect(result).toBe(stubContract);
    expect(db.get).toBeCalledWith("ChargedToken", CHAIN_ID, "0xCT", session);
  });

  it("should query db to check project token references", async () => {
    db.isDelegableStillReferenced.mockResolvedValueOnce(true);

    const result = await blockchain.isDelegableStillReferenced("0xPT");

    expect(result).toBe(true);
    expect(db.isDelegableStillReferenced).toBeCalledWith(CHAIN_ID, "0xPT");
  });

  it("should return block number", () => {
    provider.getBlockNumber.mockResolvedValueOnce(15);

    expect(blockchain.getBlockNumber()).resolves.toBe(15);
    expect(provider.getBlockNumber).toBeCalled();
  });

  it("should return user balance from db", () => {
    const balance = { balance: "0" } as IUserBalance;

    db.getBalance.mockResolvedValueOnce(balance);

    expect(blockchain.getUserBalance("0xCT", "0xUSER", session)).resolves.toStrictEqual(balance);
    expect(db.getBalance).toBeCalledWith(1337, "0xCT", "0xUSER", session);
  });

  it("should return user project token balance from db", () => {
    db.getPTBalance.mockResolvedValueOnce("10");

    expect(blockchain.getUserPTBalanceFromDb("0xPT", "0xUSER", session)).resolves.toBe("10");
    expect(db.getPTBalance).toBeCalledWith(1337, "0xPT", "0xUSER", session);
  });

  it("should return user project token balance from blockchain", () => {
    const instance = new ethers.Contract("", []);
    instance.balanceOf.mockResolvedValueOnce(BigNumber.from(10));

    const getInstance = jest.spyOn(blockchain, "getInstance");
    getInstance.mockReturnValueOnce(instance);

    expect(blockchain.getUserBalancePT("0xPT", "0xUSER")).resolves.toBe("10");
    expect(getInstance).toBeCalledWith("DelegableToLT", "0xPT");
    expect(instance.balanceOf).toBeCalledWith("0xUSER");
  });

  it("should return charged token fundraising flag", () => {
    const instance = new ethers.Contract("", []);
    instance.isFundraisingActive.mockResolvedValueOnce(true);

    const getInstance = jest.spyOn(blockchain, "getInstance");
    getInstance.mockReturnValueOnce(instance);

    expect(blockchain.getChargedTokenFundraisingStatus("0xCT")).resolves.toBe(true);
    expect(getInstance).toBeCalledWith("ChargedToken", "0xCT");
    expect(instance.isFundraisingActive).toBeCalled();
  });

  it("should return project related to lt", () => {
    const instance = new ethers.Contract("", []);
    instance.projectRelatedToLT.mockResolvedValueOnce("Project");

    const getInstance = jest.spyOn(blockchain, "getInstance");
    getInstance.mockReturnValueOnce(instance);

    expect(blockchain.getProjectRelatedToLT("0xDIRECTORY", "0xCT")).resolves.toBe("Project");
    expect(getInstance).toBeCalledWith("Directory", "0xDIRECTORY");
    expect(instance.projectRelatedToLT).toBeCalledWith("0xCT");
  });

  it("should return user liqui token data", () => {
    const instance = new ethers.Contract("", []);
    const userLiquiToken = { dateOfPartiallyCharged: 5 };
    instance.userLiquiToken.mockResolvedValueOnce(userLiquiToken);

    const getInstance = jest.spyOn(blockchain, "getInstance");
    getInstance.mockReturnValueOnce(instance);

    expect(blockchain.getUserLiquiToken("0xCT", "0xUSER")).resolves.toStrictEqual(userLiquiToken);
    expect(getInstance).toBeCalledWith("ChargedToken", "0xCT");
    expect(instance.userLiquiToken).toBeCalledWith("0xUSER");
  });

  function mockCTBalance(ctInstance: jest.Mocked<ethers.Contract>) {
    ctInstance.balanceOf.mockResolvedValueOnce(BigNumber.from(10));
    ctInstance.getUserFullyChargedBalanceLiquiToken.mockResolvedValueOnce(BigNumber.from(20));
    ctInstance.getUserPartiallyChargedBalanceLiquiToken.mockResolvedValueOnce(BigNumber.from(30));
    ctInstance.getUserDateOfPartiallyChargedToken.mockResolvedValueOnce(BigNumber.from(40));
    ctInstance.claimedRewardPerShare1e18.mockResolvedValueOnce(BigNumber.from(50));
  }

  it("should load user balances from blockchain", async () => {
    const ctInstance = new ethers.Contract("", []) as jest.Mocked<ethers.Contract>;
    const ifaceInstance = new ethers.Contract("", []) as jest.Mocked<ethers.Contract>;
    const ptInstance = new ethers.Contract("", []) as jest.Mocked<ethers.Contract>;

    const getInstance = jest.spyOn(blockchain, "getInstance");
    getInstance.mockReturnValueOnce(ctInstance).mockReturnValueOnce(ifaceInstance).mockReturnValueOnce(ptInstance);

    mockCTBalance(ctInstance);

    ptInstance.balanceOf.mockResolvedValueOnce(BigNumber.from(60));

    ifaceInstance.valueProjectTokenToFullRecharge.mockResolvedValueOnce(BigNumber.from(70));

    const result = await blockchain.loadUserBalances(15, "0xUSER", "0xCT", "0xIFACE", "0xPT");

    expect(result).toStrictEqual({
      chainId: CHAIN_ID,
      user: "0xUSER",
      address: "0xCT",
      ptAddress: "0xPT",
      lastUpdateBlock: 15,
      balance: "10",
      balancePT: "60",
      fullyChargedBalance: "20",
      partiallyChargedBalance: "30",
      dateOfPartiallyCharged: "40",
      claimedRewardPerShare1e18: "50",
      valueProjectTokenToFullRecharge: "70",
    });
  });

  it("should set default values on user balances when missing project token", async () => {
    const ctInstance = new ethers.Contract("", []) as jest.Mocked<ethers.Contract>;
    const ifaceInstance = new ethers.Contract("", []) as jest.Mocked<ethers.Contract>;

    const getInstance = jest.spyOn(blockchain, "getInstance");
    getInstance.mockReturnValueOnce(ctInstance).mockReturnValueOnce(ifaceInstance);

    mockCTBalance(ctInstance);

    ifaceInstance.valueProjectTokenToFullRecharge.mockResolvedValueOnce(BigNumber.from(70));

    const result = await blockchain.loadUserBalances(15, "0xUSER", "0xCT", "0xIFACE");

    expect(result).toStrictEqual({
      chainId: CHAIN_ID,
      user: "0xUSER",
      address: "0xCT",
      ptAddress: "",
      lastUpdateBlock: 15,
      balance: "10",
      balancePT: "0",
      fullyChargedBalance: "20",
      partiallyChargedBalance: "30",
      dateOfPartiallyCharged: "40",
      claimedRewardPerShare1e18: "50",
      valueProjectTokenToFullRecharge: "70",
    });
  });

  it("should set default values on user balances when missing interface", async () => {
    const ctInstance = new ethers.Contract("", []) as jest.Mocked<ethers.Contract>;

    const getInstance = jest.spyOn(blockchain, "getInstance");
    getInstance.mockReturnValueOnce(ctInstance);

    mockCTBalance(ctInstance);

    const result = await blockchain.loadUserBalances(15, "0xUSER", "0xCT");

    expect(result).toStrictEqual({
      chainId: CHAIN_ID,
      user: "0xUSER",
      address: "0xCT",
      ptAddress: "",
      lastUpdateBlock: 15,
      balance: "10",
      balancePT: "0",
      fullyChargedBalance: "20",
      partiallyChargedBalance: "30",
      dateOfPartiallyCharged: "40",
      claimedRewardPerShare1e18: "50",
      valueProjectTokenToFullRecharge: "0",
    });
  });

  it("should update PT address on corresponding db balances", async () => {
    const balances = [
      { user: "0xUSER1", balance: "0" },
      { user: "0xUSER2", balance: "0" },
    ] as IUserBalance[];
    const getPTBalance = jest.spyOn(blockchain, "getUserBalancePT");
    const updateBalance = jest.spyOn(blockchain, "updateBalanceAndNotify");

    db.getBalancesByContract.mockResolvedValueOnce(balances);
    getPTBalance.mockResolvedValueOnce("10").mockResolvedValueOnce("20");

    await blockchain.setProjectTokenAddressOnBalances("0xCT", "0xPT", 15, session);

    expect(db.getBalancesByContract).toBeCalledWith(CHAIN_ID, "0xCT", session);
    expect(getPTBalance).toHaveBeenNthCalledWith(1, "0xPT", "0xUSER1");
    expect(getPTBalance).toHaveBeenNthCalledWith(2, "0xPT", "0xUSER2");
    expect(updateBalance).toHaveBeenNthCalledWith(
      1,
      "0xCT",
      "0xUSER1",
      { ptAddress: "0xPT", balancePT: "10" },
      15,
      undefined,
      undefined,
      session,
    );
    expect(updateBalance).toHaveBeenNthCalledWith(
      2,
      "0xCT",
      "0xUSER2",
      { ptAddress: "0xPT", balancePT: "20" },
      15,
      undefined,
      undefined,
      session,
    );
  });

  it("should update balance and notify", async () => {
    const balance = {
      balance: "10",
      chainId: CHAIN_ID,
      address: "0xCT",
      user: "0xUSER",
      lastUpdateBlock: 15,
    } as IUserBalance;
    db.getBalance.mockResolvedValueOnce(balance);

    await blockchain.updateBalanceAndNotify("0xCT", "0xUSER", { balance: "10" }, 15, undefined, undefined, session);

    expect(db.updateBalance).toBeCalledWith(balance, session);
    expect(db.getBalance).toBeCalledWith(CHAIN_ID, "0xCT", "0xUSER", session);
    expect(broker.notifyUpdate).toBeCalledWith("UserBalance", CHAIN_ID, "0xUSER", [balance]);
  });

  it("should propagate PT balance changes to other CT", async () => {
    const balance = {
      balance: "10",
      balancePT: "20",
      chainId: CHAIN_ID,
      address: "0xCT",
      ptAddress: "0xPT",
      user: "0xUSER",
      lastUpdateBlock: 15,
    } as IUserBalance;

    const balancesToUpdate = [
      {
        user: "0xUSER",
        balance: "10",
        address: "0xCT1",
      },
      {
        user: "0xUSER",
        balance: "15",
        address: "0xCT2",
      },
    ] as IUserBalance[];

    db.getBalance.mockResolvedValueOnce(balance);
    db.getBalancesByProjectToken.mockResolvedValueOnce(balancesToUpdate);

    await blockchain.updateBalanceAndNotify("0xCT", "0xUSER", { balancePT: "20" }, 15, "0xPT", undefined, session);

    expect(db.updateBalance).toBeCalledWith(
      {
        balancePT: "20",
        chainId: balance.chainId,
        address: balance.address,
        user: balance.user,
        lastUpdateBlock: 15,
      },
      session,
    );
    expect(db.updateOtherBalancesByProjectToken).toBeCalledWith(
      "0xCT",
      {
        chainId: balance.chainId,
        user: balance.user,
        ptAddress: balance.ptAddress,
        balancePT: "20",
        lastUpdateBlock: 15,
      },
      session,
    );

    expect(db.getBalancesByProjectToken).toBeCalledWith(CHAIN_ID, "0xPT", "0xUSER", session);
    expect(broker.notifyUpdate).toHaveBeenNthCalledWith(1, "UserBalance", CHAIN_ID, "0xUSER", [balancesToUpdate[0]]);
    expect(broker.notifyUpdate).toHaveBeenNthCalledWith(2, "UserBalance", CHAIN_ID, "0xUSER", [balancesToUpdate[1]]);
  });

  it("should update PT balance on corresponding db items", async () => {
    const notifyUpdate = jest
      .spyOn(blockchain, "notifyBalancesUpdateByProjectToken")
      .mockImplementationOnce(async () => undefined);

    await blockchain.updatePTBalanceAndNotify("0xPT", "0xUSER", { balancePT: "20" }, 15, undefined, session);

    expect(db.updatePTBalances).toBeCalledWith(
      {
        balancePT: "20",
        ptAddress: "0xPT",
        chainId: CHAIN_ID,
        user: "0xUSER",
        lastUpdateBlock: 15,
      },
      session,
    );

    expect(notifyUpdate).toBeCalledWith("0xPT", "0xUSER", session);
  });

  it("should save contract in database and notify", async () => {
    const data = { address: "0xCT", totalSupply: "10" } as IChargedToken;

    db.exists.mockResolvedValueOnce(false);
    db.get.mockResolvedValueOnce(data);

    await blockchain.applyUpdateAndNotify(
      "ChargedToken",
      "0xCT",
      { totalSupply: "10" } as IChargedToken,
      15,
      undefined,
      session,
    );

    expect(db.exists).toBeCalledWith("ChargedToken", CHAIN_ID, "0xCT", session);
    expect(db.save).toBeCalledWith("ChargedToken", { totalSupply: "10" }, session);
    expect(db.get).toBeCalledWith("ChargedToken", CHAIN_ID, "0xCT", session);
    expect(broker.notifyUpdate).toBeCalledWith("ChargedToken", CHAIN_ID, "0xCT", data);
  });

  it("should update existing contract in database and notify", async () => {
    const data = { address: "0xCT", totalSupply: "10" } as IChargedToken;

    db.exists.mockResolvedValueOnce(true);
    db.get.mockResolvedValueOnce(data);

    await blockchain.applyUpdateAndNotify(
      "ChargedToken",
      "0xCT",
      { totalSupply: "10" } as IChargedToken,
      15,
      undefined,
      session,
    );

    expect(db.exists).toBeCalled();
    expect(db.update).toBeCalledWith(
      "ChargedToken",
      { totalSupply: "10", chainId: CHAIN_ID, address: "0xCT", lastUpdateBlock: 15 },
      session,
    );
    expect(db.get).toBeCalledWith("ChargedToken", CHAIN_ID, "0xCT", session);
    expect(broker.notifyUpdate).toBeCalledWith("ChargedToken", CHAIN_ID, "0xCT", data);
  });

  it("should check amount fields depending on the data type", () => {
    blockchain.checkUpdateAmounts("Directory", {});
    blockchain.checkUpdateAmounts("InterfaceProjectToken", {});
    blockchain.checkUpdateAmounts("ChargedToken", {});
    blockchain.checkUpdateAmounts("DelegableToLT", {});
    blockchain.checkUpdateAmounts("UserBalance", {});

    expect(detectNegativeAmount).toHaveBeenNthCalledWith(1, CHAIN_ID, "ChargedToken", {}, [
      "totalSupply",
      "maxInitialTokenAllocation",
      "maxStakingTokenAmount",
      "currentRewardPerShare1e18",
      "stakedLT",
      "totalLocked",
      "totalTokenAllocated",
      "campaignStakingRewards",
      "totalStakingRewards",
    ]);
    expect(detectNegativeAmount).toHaveBeenNthCalledWith(2, CHAIN_ID, "DelegableToLT", {}, ["totalSupply"]);
    expect(detectNegativeAmount).toHaveBeenNthCalledWith(3, CHAIN_ID, "UserBalance", {}, [
      "balance",
      "balancePT",
      "fullyChargedBalance",
      "partiallyChargedBalance",
      "claimedRewardPerShare1e18",
      "valueProjectTokenToFullRecharge",
    ]);
  });

  it("should subscribe to contract events", () => {
    const instance = new ethers.Contract("", []);
    const iface = new ethers.utils.Interface([]);

    const getInstance = jest.spyOn(blockchain, "getInstance");
    getInstance.mockReturnValueOnce(instance);

    const getInterface = jest.spyOn(blockchain, "getInterface");
    getInterface.mockReturnValueOnce(iface);

    let callback: ((event: ethers.providers.Log) => void) | undefined;
    (instance.on as jest.Mock).mockImplementationOnce((eventFilter, givenCallback) => {
      callback = givenCallback;
    });

    const mockHandler = jest.fn() as unknown as AbstractHandler<IChargedToken>;

    blockchain.subscribeToEvents("ChargedToken", "0xCT", mockHandler);

    expect(getInstance).toBeCalled();
    expect(instance.on).toBeCalledWith({ address: "0xCT" }, expect.any(Function));
    expect(mockHandler).not.toBeCalled();

    const log = {
      blockNumber: 15,
      address: "0xCT",
      transactionIndex: 1,
      logIndex: 2,
      topics: ["0x34d5714013380d0dd2de54669941a1e6ffeb94f624def9a559f03abd0e8e4a5c"],
      data: "0xDATA",
    } as Log;
    (blockchain.eventListener as unknown as jest.Mocked<EventListener>).queueLog.mockResolvedValueOnce(undefined);

    if (callback === undefined) throw new Error("Callback not yet initialized !");

    callback(log);

    expect(mockHandler).not.toBeCalled();
    expect(blockchain.eventListener.queueLog).toBeCalledWith("UserFunctionsAreDisabled", log, mockHandler, iface);
  });

  it("should log event handling errors", () => {
    const instance = new ethers.Contract("", []);
    const iface = new ethers.utils.Interface([]);

    const getInstance = jest.spyOn(blockchain, "getInstance");
    getInstance.mockReturnValueOnce(instance);

    const getInterface = jest.spyOn(blockchain, "getInterface");
    getInterface.mockReturnValueOnce(iface);

    const log = {
      blockNumber: 15,
      address: "0xCT",
      transactionIndex: 1,
      logIndex: 2,
      topics: ["0x34d5714013380d0dd2de54669941a1e6ffeb94f624def9a559f03abd0e8e4a5c"],
      data: "0xDATA",
    } as Log;

    (blockchain.eventListener as unknown as jest.Mocked<EventListener>).queueLog.mockImplementationOnce(async () => {
      throw new Error();
    });

    let callback: ((event: ethers.providers.Log) => void) | undefined;
    (instance.on as jest.Mock).mockImplementationOnce((eventFilter, givenCallback) => (callback = givenCallback));

    const mockHandler = jest.fn() as unknown as AbstractHandler<IChargedToken>;

    blockchain.subscribeToEvents("ChargedToken", "0xCT", mockHandler);

    if (callback === undefined) throw new Error("Callback not yet initialized !");

    callback(log);
  });

  it("should load contract from blockchain and save to db then prepare event handler", async () => {
    const loaderMock = jest.fn() as unknown as AbstractHandler<IChargedToken>;

    const instance = new ethers.Contract("", []);
    const getInstance = jest.spyOn(blockchain, "getInstance");
    getInstance.mockReturnValueOnce(instance);

    const subscribe = jest.spyOn(blockchain, "subscribeToEvents");

    db.get.mockResolvedValueOnce(null);

    const data = {
      lastUpdateBlock: 15,
      address: "0xCT",
      chainId: CHAIN_ID,
    };
    const savedData = { ...data };
    (loadContract as jest.Mock).mockResolvedValueOnce(data);
    db.save.mockResolvedValueOnce(savedData);

    const result = await blockchain.registerContract("ChargedToken", "0xCT", 15, loaderMock, session);

    expect(result).toBe(savedData);

    expect(db.get).toBeCalledWith("ChargedToken", CHAIN_ID, "0xCT", session);
    expect(getInstance).toBeCalledWith("ChargedToken", "0xCT");
    expect(loadContract).toBeCalledWith(CHAIN_ID, "ChargedToken", instance, "0xCT", 15);
    expect(db.save).toBeCalledWith("ChargedToken", data, session);
    expect(broker.notifyUpdate).toBeCalledWith("ChargedToken", CHAIN_ID, "0xCT", savedData);
    expect(subscribe).toBeCalledWith("ChargedToken", "0xCT", loaderMock);
  });

  it("should save first registed directory", async () => {
    db.get.mockResolvedValueOnce(null);

    await blockchain.registerContract(
      "Directory",
      "0xDIR",
      15,
      null as unknown as AbstractHandler<IDirectory>,
      session,
    );

    expect(blockchain["directory"]).toBe("0xDIR");
  });

  it("should fail registering duplicate directory", async () => {
    Object.defineProperty(blockchain, "directory", { value: "not undefined" });

    await expect(
      blockchain.registerContract("Directory", "0xDIR", 15, null as unknown as AbstractHandler<IDirectory>, session),
    ).rejects.toThrow();
  });

  it("should fail registering existing contract", async () => {
    const registered = jest.spyOn(blockchain, "isContractRegistered");
    registered.mockReturnValueOnce(true);

    await expect(
      blockchain.registerContract("ChargedToken", "0xCT", 15, null as unknown as AbstractHandler<IDirectory>, session),
    ).rejects.toThrow();

    expect(registered).toBeCalledWith("0xCT");
  });

  it("should load contract from db and apply all missed events", async () => {
    const loaderMock = jest.fn() as unknown as AbstractHandler<IChargedToken>;
    const loadAndSyncEvents = jest.spyOn(blockchain, "loadAndSyncEvents");

    const subscribe = jest.spyOn(blockchain, "subscribeToEvents");
    const data = {
      lastUpdateBlock: 15,
      address: "0xCT",
      chainId: CHAIN_ID,
    };

    db.get.mockResolvedValueOnce(data);

    const result = await blockchain.registerContract("ChargedToken", "0xCT", 30, loaderMock, session);

    expect(result).toBe(data);

    expect(db.get).toBeCalledWith("ChargedToken", CHAIN_ID, "0xCT", session);
    expect(loadAndSyncEvents).toBeCalledWith("ChargedToken", "0xCT", 15, expect.anything());
    expect(subscribe).toBeCalledWith("ChargedToken", "0xCT", loaderMock);
  });

  it("should load contract from db and apply missed events from last 100 blocks", async () => {
    const loaderMock = jest.fn() as unknown as AbstractHandler<IChargedToken>;
    const loadAndSyncEvents = jest.spyOn(blockchain, "loadAndSyncEvents");

    const data = {
      lastUpdateBlock: 15,
      address: "0xCT",
      chainId: CHAIN_ID,
    };

    db.get.mockResolvedValueOnce(data);

    await blockchain.registerContract("ChargedToken", "0xCT", 300, loaderMock, session);

    expect(loadAndSyncEvents).toBeCalledWith("ChargedToken", "0xCT", 200, expect.anything());
  });

  it("should queue missed events for execution", async () => {
    const loaderMock = jest.fn() as unknown as AbstractHandler<IChargedToken>;
    const getInstance = jest.spyOn(blockchain, "getInstance");
    const getInterface = jest.spyOn(blockchain, "getInterface");
    const instanceMock = new ethers.Contract("0xCT", []);
    const interfaceMock = new ethers.utils.Interface("");
    const queueLog = jest.spyOn(blockchain.eventListener, "queueLog");

    const subscribe = jest.spyOn(blockchain, "subscribeToEvents");
    const data = {
      lastUpdateBlock: 15,
      address: "0xCT",
      chainId: CHAIN_ID,
    };

    const events = [
      { address: "0xCT", blockNumber: 1, transactionIndex: 1, logIndex: 1, event: "Transfer" },
      {
        address: "0xCT",
        blockNumber: 1,
        transactionIndex: 1,
        logIndex: 2,
        event: "UserFunctionsDisabled",
      },
      {
        address: "0xCT",
        blockNumber: 1,
        transactionIndex: 1,
        logIndex: 3,
        event: "OwnershipTransferred",
      },
    ] as ethers.Event[];

    db.get.mockResolvedValueOnce(data);
    getInstance.mockReturnValue(instanceMock);
    getInterface.mockReturnValue(interfaceMock);
    (instanceMock.queryFilter as jest.Mock).mockResolvedValueOnce(events);
    db.existsEvent.mockResolvedValueOnce(false).mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    const result = await blockchain.registerContract("ChargedToken", "0xCT", 30, loaderMock, session);

    expect(result).toBe(data);

    expect(db.get).toBeCalledWith("ChargedToken", CHAIN_ID, "0xCT", session);
    expect(getInstance).toBeCalledWith("ChargedToken", "0xCT");
    expect(instanceMock.queryFilter).toBeCalledWith({ address: "0xCT" }, 15);
    expect(getInterface).toBeCalledWith("ChargedToken");
    expect(db.existsEvent).toHaveBeenNthCalledWith(
      1,
      CHAIN_ID,
      events[0].address,
      events[0].blockNumber,
      events[0].transactionIndex,
      events[0].logIndex,
    );
    expect(db.existsEvent).toHaveBeenNthCalledWith(
      2,
      CHAIN_ID,
      events[1].address,
      events[1].blockNumber,
      events[1].transactionIndex,
      events[1].logIndex,
    );
    expect(db.existsEvent).toHaveBeenNthCalledWith(
      3,
      CHAIN_ID,
      events[2].address,
      events[2].blockNumber,
      events[2].transactionIndex,
      events[2].logIndex,
    );
    expect(queueLog).toBeCalledTimes(2);
    expect(queueLog).toHaveBeenNthCalledWith(1, events[0].event, events[0], loaderMock, interfaceMock);
    expect(queueLog).toHaveBeenNthCalledWith(2, events[1].event, events[1], loaderMock, interfaceMock);
    expect(subscribe).toBeCalledWith("ChargedToken", "0xCT", loaderMock);
  });

  it("should unregister contract and remove it from db", async () => {
    const directory = { chainId: CHAIN_ID, address: "0xDIRECTORY" };
    db.get.mockResolvedValueOnce(directory);
    const instanceMock = {
      removeAllListeners: jest.fn(),
    } as unknown as ethers.Contract;

    blockchain.instances[directory.address] = instanceMock;
    blockchain.handlers[directory.address] = "x" as any;

    await blockchain.unregisterContract("Directory", directory.address, true, session);

    expect(db.get).toBeCalledWith("Directory", CHAIN_ID, directory.address, session);
    expect(instanceMock.removeAllListeners).toBeCalled();
    expect(blockchain.instances[directory.address]).toBeUndefined();
    expect(blockchain.handlers[directory.address]).toBeUndefined();
    expect(db.delete).toBeCalledWith("Directory", directory.chainId, directory.address, session);
  });

  it("should unregister linked contracts and balances if needed", async () => {
    const chargedToken = { chainId: CHAIN_ID, address: "0xCT", interfaceProjectToken: "0xINTERFACE" };
    const interfacePT = { chainId: CHAIN_ID, address: "0xINTERFACE", projectToken: "0xPT" };
    const pt = { chainId: CHAIN_ID, address: "0xPT" };

    db.get.mockResolvedValueOnce(chargedToken).mockResolvedValueOnce(interfacePT).mockResolvedValueOnce(pt);
    db.isDelegableStillReferenced.mockResolvedValueOnce(false);

    const instanceMock = {
      removeAllListeners: jest.fn(),
    } as unknown as ethers.Contract;

    blockchain.instances[chargedToken.address] = instanceMock;
    blockchain.instances[interfacePT.address] = instanceMock;
    blockchain.instances[pt.address] = instanceMock;

    await blockchain.unregisterContract("ChargedToken", chargedToken.address, true, session);

    expect(db.get).toHaveBeenNthCalledWith(1, "ChargedToken", CHAIN_ID, chargedToken.address, session);
    expect(blockchain.instances[chargedToken.address]).toBeUndefined();
    expect(db.delete).toHaveBeenNthCalledWith(1, "ChargedToken", chargedToken.chainId, chargedToken.address, session);
    expect(db.delete).toHaveBeenNthCalledWith(2, "UserBalance", chargedToken.chainId, chargedToken.address, session);

    expect(db.get).toHaveBeenNthCalledWith(2, "InterfaceProjectToken", CHAIN_ID, interfacePT.address, session);
    expect(blockchain.instances[interfacePT.address]).toBeUndefined();
    expect(db.delete).toHaveBeenNthCalledWith(
      3,
      "InterfaceProjectToken",
      interfacePT.chainId,
      interfacePT.address,
      session,
    );
    expect(db.isDelegableStillReferenced).toBeCalledWith(CHAIN_ID, interfacePT.projectToken);

    expect(db.get).toHaveBeenNthCalledWith(3, "DelegableToLT", CHAIN_ID, pt.address, session);
    expect(blockchain.instances[pt.address]).toBeUndefined();
    expect(db.delete).toHaveBeenNthCalledWith(4, "DelegableToLT", pt.chainId, pt.address, session);

    expect(instanceMock.removeAllListeners).toBeCalledTimes(3);
  });

  it("should load user balances for all charged tokens", async () => {
    const directory = { address: "0xDIR", directory: ["0xCT1", "0xCT2"] };
    const chargedTokens = [
      { address: "0xCT1", interfaceProjectToken: EMPTY_ADDRESS },
      { address: "0xCT2", interfaceProjectToken: "0xIFACE" },
    ];
    const iface = { address: "0xIFACE", projectToken: "0xPT" };
    const balances = [
      { chainId: CHAIN_ID, address: "0xCT1", user: "0xUSER" },
      { chainId: CHAIN_ID, address: "0xCT2", ptAddress: "0xPT", user: "0xUSER" },
    ] as IUserBalance[];

    db.get
      .mockResolvedValueOnce(directory)
      .mockResolvedValueOnce(chargedTokens[0])
      .mockResolvedValueOnce(chargedTokens[1])
      .mockResolvedValueOnce(iface);

    db.existsBalance.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    db.getBalances.mockResolvedValueOnce(balances);

    const loadUserBalances = jest.spyOn(blockchain, "loadUserBalances");
    loadUserBalances.mockResolvedValueOnce(balances[0]).mockResolvedValueOnce(balances[1]);

    Object.defineProperty(blockchain, "directory", { value: directory.address });

    const result = await blockchain.loadAllUserBalances("0xUSER", 15);

    expect(db.get).toHaveBeenNthCalledWith(1, "Directory", CHAIN_ID, "0xDIR", undefined);
    expect(db.get).toHaveBeenNthCalledWith(2, "ChargedToken", CHAIN_ID, directory.directory[0], undefined);
    expect(db.get).toHaveBeenNthCalledWith(3, "ChargedToken", CHAIN_ID, directory.directory[1], undefined);
    expect(db.get).toHaveBeenNthCalledWith(
      4,
      "InterfaceProjectToken",
      CHAIN_ID,
      chargedTokens[1].interfaceProjectToken,
      undefined,
    );

    expect(loadUserBalances).toHaveBeenNthCalledWith(1, 15, "0xUSER", "0xCT1", undefined, undefined);
    expect(loadUserBalances).toHaveBeenNthCalledWith(2, 15, "0xUSER", "0xCT2", "0xIFACE", "0xPT");

    expect(db.existsBalance).toHaveBeenNthCalledWith(1, CHAIN_ID, "0xCT1", "0xUSER");
    expect(db.existsBalance).toHaveBeenNthCalledWith(2, CHAIN_ID, "0xCT2", "0xUSER");

    expect(db.updateBalance).toBeCalledWith(balances[0]);
    expect(db.saveBalance).toBeCalledWith(balances[1]);

    expect(db.getBalances).toBeCalledWith(CHAIN_ID, "0xUSER");

    expect(broker.notifyUpdate).toBeCalledWith("UserBalance", CHAIN_ID, "0xUSER", balances);

    expect(result).toStrictEqual(balances);
  });
});
