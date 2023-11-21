import { BigNumber, ethers } from "ethers";
import { ClientSession } from "mongodb";
import { pubSub } from "../../graphql";
import { UserBalanceModel } from "../../models";
import { EMPTY_ADDRESS } from "../../types";
import { ChargedToken } from "../ChargedToken";
import { DelegableToLT } from "../DelegableToLT";
import { Directory } from "../Directory";
import { type EventListener } from "../EventListener";
import { InterfaceProjectToken } from "../InterfaceProjectToken";

jest.mock("../../config");
jest.mock("../EventListener");
jest.mock("../../topics");
jest.mock("../../graphql");
jest.mock("../../models");
jest.mock("../Directory");
jest.mock("../ChargedToken");
jest.mock("../DelegableToLT");

describe("InterfaceProjectToken loader", () => {
  const CHAIN_ID = 1337;
  const OWNER = "0x493942A95Bc6Db03CE8Cc22ff5a0441Dcc581f45";
  const ADDRESS = "0xF79A6c67E99b2135E09C3Ba0d06AE60977C1f393";
  const BLOCK_NUMBER = 15;
  const PT_ADDRESS = "0xPT";

  beforeEach(() => {
    Object.defineProperty(InterfaceProjectToken, "subscribedProjects", { value: [] });
    Object.defineProperty(InterfaceProjectToken, "projectInstances", { value: {} });
    Object.defineProperty(InterfaceProjectToken, "projectUsageCount", { value: {} });
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
    // initialization
    const provider = new ethers.providers.JsonRpcProvider();
    const directoryLoader = new Directory(undefined as unknown as EventListener, CHAIN_ID, provider, ADDRESS);
    const ctLoader = new ChargedToken(CHAIN_ID, provider, ADDRESS, directoryLoader);
    const loader = new InterfaceProjectToken(CHAIN_ID, provider, ADDRESS, directoryLoader, ctLoader);
    const session = new ClientSession();

    // checking constructor
    expect(loader.chainId).toBe(CHAIN_ID);
    expect(loader.provider).toBe(provider);
    expect(loader.eventsListener).toBe(directoryLoader.eventsListener);
    expect(loader.directory).toBe(directoryLoader);
    expect(loader.ct).toBe(ctLoader);
    expect(loader.address).toBe(ADDRESS);
    expect(loader.initBlock).toBe(0);
    expect(loader.lastUpdateBlock).toBe(0);
    expect(loader.lastState).toEqual(undefined);

    // mocking ethers
    (provider as any).getBlockNumber.mockResolvedValueOnce(BLOCK_NUMBER);

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

    const modelInstanceMock = { save: jest.fn() };
    (loader.model as any).toModel.mockReturnValueOnce(modelInstanceMock);
    (loader.model as any).exists.mockResolvedValueOnce(null);
    (loader.model as any).toGraphQL.mockReturnValueOnce(graphqlModel);

    // mocking contract instance
    loader.instance.owner.mockResolvedValueOnce(OWNER);
    loader.instance.liquidityToken.mockResolvedValueOnce("0xLT");
    loader.instance.projectToken.mockResolvedValueOnce(EMPTY_ADDRESS);
    loader.instance.dateLaunch.mockResolvedValueOnce(BigNumber.from(1));
    loader.instance.dateEndCliff.mockResolvedValueOnce(BigNumber.from(2));
    loader.instance.claimFeesPerThousandForPT.mockResolvedValueOnce(BigNumber.from(3));

    // tested function
    await loader.init(session, BLOCK_NUMBER, true);

    // expectations
    expect(loader.initBlock).toBe(BLOCK_NUMBER);
    expect(loader.lastUpdateBlock).toBe(BLOCK_NUMBER);
    expect(loader.lastState).toEqual(graphqlModel);

    expect((loader.model as any).exists).toBeCalledTimes(1);
    expect((loader.model as any).findOne).toHaveBeenNthCalledWith(
      2,
      {
        chainId: CHAIN_ID,
        address: ADDRESS,
      },
      undefined,
      { session },
    );
    expect((loader.model as any).toModel).toBeCalledTimes(1);
    expect((loader.model as any).toGraphQL).toBeCalledTimes(1);
    expect(modelInstanceMock.save).toHaveBeenCalledTimes(1);

    expect(loader.projectToken).toBeDefined();
    expect(loader.projectToken?.init).toBeCalledTimes(1);

    expect(loader.instance.owner).toBeCalledTimes(1);
    expect(loader.instance.liquidityToken).toBeCalledTimes(1);
    expect(loader.instance.projectToken).toBeCalledTimes(1);
    expect(loader.instance.dateLaunch).toBeCalledTimes(1);
    expect(loader.instance.dateEndCliff).toBeCalledTimes(1);
    expect(loader.instance.claimFeesPerThousandForPT).toBeCalledTimes(1);
    expect(loader.instance.queryFilter).toBeCalledTimes(0);

    expect((session as any).startTransaction).toBeCalledTimes(1);
    expect((session as any).commitTransaction).toBeCalledTimes(1);
  });

  test("Should use events to update existing InterfaceProjectToken from db", async () => {
    // initialization
    const provider = new ethers.providers.JsonRpcProvider();
    const directoryLoader = new Directory(undefined as unknown as EventListener, CHAIN_ID, provider, ADDRESS);
    const ctLoader = new ChargedToken(CHAIN_ID, provider, ADDRESS, directoryLoader);
    const loader = new InterfaceProjectToken(CHAIN_ID, provider, ADDRESS, directoryLoader, ctLoader);
    const session = new ClientSession();

    // mocking ethers
    const PREV_BLOCK_NUMBER = 15;
    const BLOCK_NUMBER = 20;

    (provider as any).getBlockNumber.mockResolvedValueOnce(BLOCK_NUMBER);

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

    const graphqlModel = {
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

    const modelInstanceMock = { save: jest.fn() };
    (loader.model as any).toModel.mockReturnValueOnce(modelInstanceMock);
    (loader.model as any).findOne.mockResolvedValueOnce(loadedModel);
    (loader.model as any).toGraphQL.mockReturnValueOnce(graphqlModel);

    // mocking contract instance
    (loader.instance as any).queryFilter.mockResolvedValueOnce([]);

    // tested function
    await loader.init(session, BLOCK_NUMBER, true);

    // expectations
    expect(loader.initBlock).toBe(PREV_BLOCK_NUMBER);
    expect(loader.lastUpdateBlock).toBe(PREV_BLOCK_NUMBER);
    expect(loader.lastState).toEqual(graphqlModel);

    expect((loader.model as any).exists).toBeCalledTimes(0);
    expect((loader.model as any).findOne).toHaveBeenNthCalledWith(
      1,
      {
        chainId: CHAIN_ID,
        address: ADDRESS,
      },
      undefined,
      { session },
    );
    expect((loader.model as any).toModel).toBeCalledTimes(0);
    expect((loader.model as any).toGraphQL).toBeCalledTimes(1);
    expect(modelInstanceMock.save).toHaveBeenCalledTimes(0);

    expect(loader.projectToken).toBeDefined();
    expect(loader.projectToken?.init).toBeCalledTimes(1);

    expect(loader.instance.owner).toBeCalledTimes(0);
    expect(loader.instance.liquidityToken).toBeCalledTimes(0);
    expect(loader.instance.projectToken).toBeCalledTimes(0);
    expect(loader.instance.dateLaunch).toBeCalledTimes(0);
    expect(loader.instance.dateEndCliff).toBeCalledTimes(0);
    expect(loader.instance.claimFeesPerThousandForPT).toBeCalledTimes(0);
    expect(loader.instance.queryFilter).toBeCalledTimes(1);

    expect(loader.lastState).toEqual(graphqlModel);

    expect((session as any).startTransaction).toBeCalledTimes(1);
    expect((session as any).commitTransaction).toBeCalledTimes(1);
  });

  test("Should initialize project token when not available", async () => {
    // initialization
    const provider = new ethers.providers.JsonRpcProvider();
    const directoryLoader = new Directory(undefined as unknown as EventListener, CHAIN_ID, provider, ADDRESS);
    const ctLoader = new ChargedToken(CHAIN_ID, provider, ADDRESS, directoryLoader);
    const loader = new InterfaceProjectToken(CHAIN_ID, provider, ADDRESS, directoryLoader, ctLoader);
    const session = new ClientSession();

    // mocking ethers
    const BLOCK_NUMBER = 20;

    (provider as any).getBlockNumber.mockResolvedValueOnce(BLOCK_NUMBER);

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

    const modelInstanceMock = { save: jest.fn() };
    (loader.model as any).toModel.mockReturnValueOnce(modelInstanceMock);
    (loader.model as any).findOne.mockResolvedValueOnce(loadedModel);
    (loader.model as any).toGraphQL.mockReturnValueOnce(loadedModel);

    // mocking contract instance
    (loader.instance as any).queryFilter.mockResolvedValueOnce([]);

    // tested function
    await loader.init(session, BLOCK_NUMBER, true);
    loader.subscribeToEvents();

    // expectations
    expect(loader.projectToken).toBeDefined();
    expect(loader.skipProjectUpdates).toBe(false);
    expect(loader.projectToken?.init).toBeCalledTimes(1);
    expect(loader.projectToken?.subscribeToEvents).toBeCalledTimes(1);
    expect(loader.instance.on).toHaveBeenNthCalledWith(1, { address: ADDRESS }, expect.anything());
    expect(InterfaceProjectToken.projectInstances[PT_ADDRESS]).toBe(loader.projectToken);
    expect(InterfaceProjectToken.projectUsageCount[PT_ADDRESS]).toBe(0);
    expect(InterfaceProjectToken.subscribedProjects).toContain(PT_ADDRESS);
  });

  test("Should use existing project token if available", async () => {
    // initialization
    const provider = new ethers.providers.JsonRpcProvider();
    const directoryLoader = new Directory(undefined as unknown as EventListener, CHAIN_ID, provider, ADDRESS);
    const ctLoader = new ChargedToken(CHAIN_ID, provider, ADDRESS, directoryLoader);
    const loader = new InterfaceProjectToken(CHAIN_ID, provider, ADDRESS, directoryLoader, ctLoader);
    const session = new ClientSession();

    // preparing existing mock
    const PT_ADDRESS = "0xPT";
    const ptLoader = new DelegableToLT(CHAIN_ID, provider, PT_ADDRESS, directoryLoader, ctLoader);
    InterfaceProjectToken.projectInstances[PT_ADDRESS] = ptLoader;
    InterfaceProjectToken.projectUsageCount[PT_ADDRESS] = 0;
    InterfaceProjectToken.subscribedProjects.push(PT_ADDRESS);

    // mocking ethers
    const BLOCK_NUMBER = 20;

    (provider as any).getBlockNumber.mockResolvedValueOnce(BLOCK_NUMBER);

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

    const modelInstanceMock = { save: jest.fn() };
    (loader.model as any).toModel.mockReturnValueOnce(modelInstanceMock);
    (loader.model as any).findOne.mockResolvedValueOnce(loadedModel);
    (loader.model as any).toGraphQL.mockReturnValueOnce(loadedModel);

    // mocking contract instance
    (loader.instance as any).queryFilter.mockResolvedValueOnce([]);

    // tested function
    await loader.init(session, BLOCK_NUMBER, true);
    loader.subscribeToEvents();

    // expectations
    expect(loader.projectToken).toBeDefined();
    expect(loader.skipProjectUpdates).toBe(true);
    expect(loader.projectToken?.init).not.toBeCalled();
    expect(loader.projectToken?.subscribeToEvents).not.toBeCalled();
    expect(loader.instance.on).toHaveBeenNthCalledWith(1, { address: ADDRESS }, expect.anything());
    expect(loader.projectToken).toBe(ptLoader);
    expect(InterfaceProjectToken.projectInstances[PT_ADDRESS]).toBe(ptLoader);
    expect(InterfaceProjectToken.projectUsageCount[PT_ADDRESS]).toBe(1);
    expect(InterfaceProjectToken.subscribedProjects).toContain(PT_ADDRESS);
  });

  test("should load PT balance from delegable to lt contract", async () => {
    // initialization
    const provider = new ethers.providers.JsonRpcProvider();
    const directoryLoader = new Directory(undefined as unknown as EventListener, CHAIN_ID, provider, ADDRESS);
    const ctLoader = new ChargedToken(CHAIN_ID, provider, ADDRESS, directoryLoader);
    const loader = new InterfaceProjectToken(CHAIN_ID, provider, ADDRESS, directoryLoader, ctLoader);

    loader.projectToken = new DelegableToLT(CHAIN_ID, provider, ADDRESS, directoryLoader, ctLoader);

    await loader.loadUserBalancePT("0xUSER");

    expect(loader.projectToken.loadUserBalance).toHaveBeenNthCalledWith(1, "0xUSER");
  });

  test("should load value project token to full recharge from blockchain", async () => {
    // initialization
    const provider = new ethers.providers.JsonRpcProvider();
    const directoryLoader = new Directory(undefined as unknown as EventListener, CHAIN_ID, provider, ADDRESS);
    const ctLoader = new ChargedToken(CHAIN_ID, provider, ADDRESS, directoryLoader);
    const loader = new InterfaceProjectToken(CHAIN_ID, provider, ADDRESS, directoryLoader, ctLoader);

    (loader.instance as any).valueProjectTokenToFullRecharge.mockResolvedValueOnce(BigNumber.from(0));

    await loader.loadValueProjectTokenToFullRecharge("0xUSER");

    expect(loader.instance.valueProjectTokenToFullRecharge).toHaveBeenNthCalledWith(1, "0xUSER");
  });

  test("should update all matching balances with project token address and PT balance", async () => {
    // initialization
    const provider = new ethers.providers.JsonRpcProvider();
    const directoryLoader = new Directory(undefined as unknown as EventListener, CHAIN_ID, provider, ADDRESS);
    const ctLoader = new ChargedToken(CHAIN_ID, provider, ADDRESS, directoryLoader);
    const loader = new InterfaceProjectToken(CHAIN_ID, provider, ADDRESS, directoryLoader, ctLoader);
    const session = new ClientSession();

    const balancesToUpdate = [
      { address: "0xCT", user: "0xUSER1" },
      { address: "0xCT", user: "0xUSER2" },
    ];
    (UserBalanceModel as any).find.mockResolvedValueOnce(balancesToUpdate);

    const loadPTBalance = jest.spyOn(loader, "loadUserBalancePT").mockResolvedValueOnce("1").mockResolvedValueOnce("2");

    const updateBalance = jest.spyOn(loader, "updateBalanceAndNotify").mockResolvedValue(undefined);

    await loader.setProjectTokenAddressOnBalances(session, "0xCT", "0xPT", BLOCK_NUMBER);

    expect(UserBalanceModel.find).toHaveBeenNthCalledWith(1, { address: "0xCT" }, null, { session });
    expect(loadPTBalance).toHaveBeenNthCalledWith(1, "0xUSER1");
    expect(loadPTBalance).toHaveBeenNthCalledWith(2, "0xUSER2");
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

  test("destroy interface with project when it is the last reference", async () => {
    // initialization
    const provider = new ethers.providers.JsonRpcProvider();
    const directoryLoader = new Directory(undefined as unknown as EventListener, CHAIN_ID, provider, ADDRESS);
    const ctLoader = new ChargedToken(CHAIN_ID, provider, ADDRESS, directoryLoader);
    const loader = new InterfaceProjectToken(CHAIN_ID, provider, ADDRESS, directoryLoader, ctLoader);

    loader.projectToken = new DelegableToLT(CHAIN_ID, provider, ADDRESS, directoryLoader, ctLoader);
    Object.defineProperty(loader.projectToken, "address", { value: ADDRESS });
    InterfaceProjectToken.projectUsageCount[ADDRESS] = 0;
    InterfaceProjectToken.projectInstances[ADDRESS] = loader.projectToken;
    InterfaceProjectToken.subscribedProjects.push(ADDRESS);

    await loader.destroy();

    expect(loader.projectToken.destroy).toBeCalledTimes(1);
    expect(loader.instance.removeAllListeners).toBeCalledTimes(1);
    expect(InterfaceProjectToken.projectUsageCount[ADDRESS]).toBeUndefined();
    expect(InterfaceProjectToken.projectInstances[ADDRESS]).toBeUndefined();
    expect(InterfaceProjectToken.subscribedProjects).not.toContain(ADDRESS);
  });

  test("destroy interface only if project is still referenced", async () => {
    // initialization
    const provider = new ethers.providers.JsonRpcProvider();
    const directoryLoader = new Directory(undefined as unknown as EventListener, CHAIN_ID, provider, ADDRESS);
    const ctLoader = new ChargedToken(CHAIN_ID, provider, ADDRESS, directoryLoader);
    const loader = new InterfaceProjectToken(CHAIN_ID, provider, ADDRESS, directoryLoader, ctLoader);

    loader.projectToken = new DelegableToLT(CHAIN_ID, provider, ADDRESS, directoryLoader, ctLoader);
    Object.defineProperty(loader.projectToken, "address", { value: ADDRESS });
    InterfaceProjectToken.projectUsageCount[ADDRESS] = 1;
    InterfaceProjectToken.projectInstances[ADDRESS] = loader.projectToken;
    InterfaceProjectToken.subscribedProjects.push(ADDRESS);

    await loader.destroy();

    expect(loader.projectToken.destroy).not.toBeCalled();
    expect(loader.instance.removeAllListeners).toBeCalledTimes(1);
    expect(InterfaceProjectToken.projectUsageCount[ADDRESS]).toBe(0);
    expect(InterfaceProjectToken.projectInstances[ADDRESS]).toBe(loader.projectToken);
    expect(InterfaceProjectToken.subscribedProjects).toContain(ADDRESS);
  });

  // Event handlers
  test("StartSet", async () => {
    // initialization
    const provider = new ethers.providers.JsonRpcProvider();
    const directoryLoader = new Directory(undefined as unknown as EventListener, CHAIN_ID, provider, ADDRESS);
    const ctLoader = new ChargedToken(CHAIN_ID, provider, ADDRESS, directoryLoader);
    const loader = new InterfaceProjectToken(CHAIN_ID, provider, ADDRESS, directoryLoader, ctLoader);
    const session = new ClientSession();

    const loadedModel = sampleData();

    (loader.model as any).exists.mockResolvedValueOnce("not_null");
    (loader.model as any).toGraphQL.mockReturnValueOnce(loadedModel);

    const dateLaunch = BigNumber.from("10");
    const dateEndCliff = BigNumber.from("20");

    await loader.onStartSetEvent(session, [dateLaunch, dateEndCliff], BLOCK_NUMBER, "StartSet");

    expect((loader.model as any).exists).toBeCalledTimes(1);
    expect((loader.model as any).findOne).toBeCalledTimes(1);
    expect((loader.model as any).toGraphQL).toBeCalledTimes(1);
    expect((loader.model as any).updateOne).toHaveBeenCalledWith(
      { chainId: CHAIN_ID, address: ADDRESS },
      { lastUpdateBlock: BLOCK_NUMBER, dateLaunch: dateLaunch.toString(), dateEndCliff: dateEndCliff.toString() },
      { session },
    );

    expect(pubSub.publish).toHaveBeenCalledWith(`InterfaceProjectToken.${CHAIN_ID}.${ADDRESS}`, loadedModel);
    expect(pubSub.publish).toHaveBeenCalledWith(`InterfaceProjectToken.${CHAIN_ID}`, loadedModel);
  });

  test("ProjectTokenReceived", async () => {
    // initialization
    const provider = new ethers.providers.JsonRpcProvider();
    const directoryLoader = new Directory(undefined as unknown as EventListener, CHAIN_ID, provider, ADDRESS);
    const ctLoader = new ChargedToken(CHAIN_ID, provider, ADDRESS, directoryLoader);
    const loader = new InterfaceProjectToken(CHAIN_ID, provider, ADDRESS, directoryLoader, ctLoader);
    const session = new ClientSession();

    // does nothing
    await loader.onProjectTokenReceivedEvent(session, [], BLOCK_NUMBER, "ProjectTokenReceived");
  });

  test("IncreasedValueProjectTokenToFullRecharge", async () => {
    // initialization
    const provider = new ethers.providers.JsonRpcProvider();
    const directoryLoader = new Directory(undefined as unknown as EventListener, CHAIN_ID, provider, ADDRESS);
    const ctLoader = new ChargedToken(CHAIN_ID, provider, ADDRESS, directoryLoader);
    const loader = new InterfaceProjectToken(CHAIN_ID, provider, ADDRESS, directoryLoader, ctLoader);
    const session = new ClientSession();
    const ctContract = new ethers.Contract("", []);

    Object.defineProperty(ctLoader, "address", { value: "0xCT" });
    Object.defineProperty(ctLoader, "instance", { value: ctContract });

    const balance = {
      valueProjectTokenToFullRecharge: "100",
    };
    (UserBalanceModel as any).findOne.mockResolvedValueOnce(balance);
    ctLoader.instance.userLiquiToken.mockResolvedValueOnce({ dateOfPartiallyCharged: BigNumber.from("150") });
    const updateBalance = jest.spyOn(loader, "updateBalanceAndNotify").mockResolvedValue(undefined);

    await loader.onIncreasedValueProjectTokenToFullRechargeEvent(
      session,
      ["0xUSER", "100"],
      BLOCK_NUMBER,
      "IncreasedValueProjectTokenToFullRecharge",
    );

    expect(UserBalanceModel.findOne).toBeCalledTimes(1);
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
    // initialization
    const provider = new ethers.providers.JsonRpcProvider();
    const directoryLoader = new Directory(undefined as unknown as EventListener, CHAIN_ID, provider, ADDRESS);
    const ctLoader = new ChargedToken(CHAIN_ID, provider, ADDRESS, directoryLoader);
    const loader = new InterfaceProjectToken(CHAIN_ID, provider, ADDRESS, directoryLoader, ctLoader);
    const session = new ClientSession();

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
    // initialization
    const provider = new ethers.providers.JsonRpcProvider();
    const directoryLoader = new Directory(undefined as unknown as EventListener, CHAIN_ID, provider, ADDRESS);
    const ctLoader = new ChargedToken(CHAIN_ID, provider, ADDRESS, directoryLoader);
    const loader = new InterfaceProjectToken(CHAIN_ID, provider, ADDRESS, directoryLoader, ctLoader);
    const session = new ClientSession();

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
