import { BigNumber, ethers } from "ethers";
import { ClientSession } from "mongodb";
import { pubSub } from "../../graphql";
import {
  ChargedTokenModel,
  DelegableToLTModel,
  DirectoryModel,
  InterfaceProjectTokenModel,
  UserBalanceModel,
} from "../../models";
import { ChargedToken } from "../ChargedToken";
import { Directory } from "../Directory";
import { EventListener } from "../EventListener";

jest.mock("../../globals/config");
jest.mock("../EventListener");
jest.mock("../../topics");
jest.mock("../../graphql");
jest.mock("../../models");
jest.mock("../ChargedToken");
jest.mock("../FundraisingChargedToken");

describe("Directory loader", () => {
  const CHAIN_ID = 1337;
  const OWNER = "0x493942A95Bc6Db03CE8Cc22ff5a0441Dcc581f45";
  const ADDRESS = "0xF79A6c67E99b2135E09C3Ba0d06AE60977C1f393";
  const BLOCK_NUMBER = 15;

  function sampleData() {
    return {
      chainId: CHAIN_ID,
      initBlock: BLOCK_NUMBER,
      lastUpdateBlock: BLOCK_NUMBER,
      address: ADDRESS,
      owner: OWNER,
      directory: [],
      whitelistedProjectOwners: [],
      projects: [],
      projectRelatedToLT: {},
      whitelist: {},
      areUserFunctionsDisabled: false,
    };
  }

  function sampleGraphqlData() {
    return {
      chainId: CHAIN_ID,
      initBlock: BLOCK_NUMBER,
      lastUpdateBlock: BLOCK_NUMBER,
      address: ADDRESS,
      owner: OWNER,
      directory: [],
      whitelistedProjectOwners: [],
      projects: [],
      projectRelatedToLT: [],
      whitelist: [],
      areUserFunctionsDisabled: false,
    };
  }

  test("Should initialize Directory by reading blockchain when not in db", async () => {
    // initialization
    const eventListener = new EventListener();
    const provider = new ethers.providers.JsonRpcProvider();
    const loader = new Directory(eventListener, CHAIN_ID, provider, ADDRESS);
    const session = new ClientSession();

    // checking constructor
    expect(loader.chainId).toBe(CHAIN_ID);
    expect(loader.provider).toBe(provider);
    expect(loader.eventsListener).toBe(eventListener);
    expect(loader.address).toBe(ADDRESS);
    expect(loader.initBlock).toBe(0);
    expect(loader.lastUpdateBlock).toBe(0);
    expect(loader.lastState).toEqual(undefined);

    // mocking ethers
    (provider as any).getBlockNumber.mockResolvedValueOnce(BLOCK_NUMBER);

    // mocking mongo model
    const graphqlModel = sampleGraphqlData();

    const modelInstanceMock = { save: jest.fn() };
    (loader.model as any).toModel.mockReturnValueOnce(modelInstanceMock);
    (loader.model as any).exists.mockResolvedValueOnce(null);
    (loader.model as any).toGraphQL.mockReturnValueOnce(graphqlModel);

    // mocking contract instance
    loader.instance.countWhitelistedProjectOwners.mockResolvedValueOnce(BigNumber.from(0));
    loader.instance.countLTContracts.mockResolvedValueOnce(BigNumber.from(0));
    loader.instance.owner.mockResolvedValueOnce(OWNER);
    loader.instance.areUserFunctionsDisabled.mockResolvedValueOnce(false);

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

    expect(loader.instance.countWhitelistedProjectOwners).toBeCalledTimes(1);
    expect(loader.instance.countLTContracts).toBeCalledTimes(1);
    expect(loader.instance.owner).toBeCalledTimes(1);
    expect(loader.instance.areUserFunctionsDisabled).toBeCalledTimes(1);
    expect(loader.instance.queryFilter).toBeCalledTimes(0);

    expect((session as any).startTransaction).toBeCalledTimes(1);
    expect((session as any).commitTransaction).toBeCalledTimes(1);
  });

  test("Should use events to update existing Directory from db", async () => {
    // initialization
    const eventListener = new EventListener();
    const provider = new ethers.providers.JsonRpcProvider();
    const loader = new Directory(eventListener, CHAIN_ID, provider, ADDRESS);
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
      directory: [],
      whitelistedProjectOwners: [],
      projects: [],
      projectRelatedToLT: {},
      whitelist: {},
      areUserFunctionsDisabled: false,
    };

    const graphqlModel = {
      chainId: CHAIN_ID,
      initBlock: PREV_BLOCK_NUMBER,
      lastUpdateBlock: PREV_BLOCK_NUMBER,
      address: ADDRESS,
      owner: OWNER,
      directory: [],
      whitelistedProjectOwners: [],
      projects: [],
      projectRelatedToLT: [],
      whitelist: [],
      areUserFunctionsDisabled: false,
    };

    const modelInstanceMock = { save: jest.fn() };
    (loader.model as any).toModel.mockReturnValueOnce(modelInstanceMock);
    (loader.model as any).findOne.mockResolvedValueOnce(loadedModel);
    (loader.model as any).toGraphQL.mockReturnValueOnce(graphqlModel);

    // mocking contract instance
    (loader.instance as any).queryFilter.mockResolvedValueOnce(() => []);

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

    expect(loader.instance.countWhitelistedProjectOwners).toBeCalledTimes(0);
    expect(loader.instance.countLTContracts).toBeCalledTimes(0);
    expect(loader.instance.owner).toBeCalledTimes(0);
    expect(loader.instance.areUserFunctionsDisabled).toBeCalledTimes(0);
    expect(loader.instance.queryFilter).toBeCalledTimes(1);

    expect(loader.lastState).toEqual(graphqlModel);

    expect((session as any).startTransaction).toBeCalledTimes(1);
    expect((session as any).commitTransaction).toBeCalledTimes(1);
  });

  test("Should initialize available charged tokens", async () => {
    // initialization
    const eventListener = new EventListener();
    const provider = new ethers.providers.JsonRpcProvider();
    const loader = new Directory(eventListener, CHAIN_ID, provider, ADDRESS);
    const session = new ClientSession();

    // mocking ethers
    const PREV_BLOCK_NUMBER = 15;
    const BLOCK_NUMBER = 20;

    (provider as any).getBlockNumber.mockResolvedValueOnce(() => BLOCK_NUMBER);

    // mocking mongo model
    const loadedModel = {
      chainId: CHAIN_ID,
      initBlock: PREV_BLOCK_NUMBER,
      lastUpdateBlock: PREV_BLOCK_NUMBER,
      address: ADDRESS,
      owner: OWNER,
      directory: ["0xCT"],
      whitelistedProjectOwners: [],
      projects: [],
      projectRelatedToLT: {},
      whitelist: {},
      areUserFunctionsDisabled: false,
    };

    const graphqlModel = {
      chainId: CHAIN_ID,
      initBlock: PREV_BLOCK_NUMBER,
      lastUpdateBlock: PREV_BLOCK_NUMBER,
      address: ADDRESS,
      owner: OWNER,
      directory: ["0xCT"],
      whitelistedProjectOwners: [],
      projects: [],
      projectRelatedToLT: [],
      whitelist: [],
      areUserFunctionsDisabled: false,
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
    expect(loader.lastState).toEqual(graphqlModel);
    expect(Object.keys(loader.ct).length).toBe(1);
    expect(loader.ct["0xCT"]).toBeDefined();
    expect((loader.ct["0xCT"] as any).init).toHaveBeenNthCalledWith(1, session, BLOCK_NUMBER, true);
  });

  test("Should propagate user balances loading and save them for the first time", async () => {
    // initialization
    const eventListener = new EventListener();
    const provider = new ethers.providers.JsonRpcProvider();
    const loader = new Directory(eventListener, CHAIN_ID, provider, ADDRESS);
    const session = new ClientSession();

    const userAddress = "0xUSER";
    const ctAddress = "0xCT";
    const ct = new ChargedToken(loader.chainId, provider, ctAddress, loader);
    loader.ct[ctAddress] = ct;

    const ctBalance = { address: ctAddress, balance: "xxx" };

    (ct as any).loadUserBalances.mockResolvedValueOnce(ctBalance);
    (UserBalanceModel as any).exists.mockResolvedValueOnce(null);
    const mockModel = { save: jest.fn(async () => undefined) };
    (UserBalanceModel as any).toModel.mockReturnValueOnce(mockModel);
    (UserBalanceModel as any).find.mockReturnValueOnce({
      exec: jest.fn().mockResolvedValue([ctBalance]),
    });
    (UserBalanceModel as any).toGraphQL.mockResolvedValueOnce(ctBalance);

    // tested function
    const result = await loader.loadAllUserBalances(session, userAddress, BLOCK_NUMBER, ctAddress);

    // expectations
    expect(result).toEqual([ctBalance]);

    expect(ct.loadUserBalances).toHaveBeenNthCalledWith(1, userAddress, BLOCK_NUMBER);
    expect(UserBalanceModel.exists).toHaveBeenNthCalledWith(1, {
      chainId: CHAIN_ID,
      user: userAddress,
      address: ctAddress,
    });
    expect(UserBalanceModel.toModel).toHaveBeenCalledTimes(1);
    expect(mockModel.save).toHaveBeenNthCalledWith(1, { session });
    expect(UserBalanceModel.find).toHaveBeenNthCalledWith(1, { chainId: CHAIN_ID, user: userAddress }, undefined, {
      session,
    });
    expect(UserBalanceModel.toGraphQL).toBeCalledTimes(1);
    expect(pubSub.publish).toBeCalledTimes(1);
  });

  test("Should propagate user balances loading and update them when existing", async () => {
    // initialization
    const eventListener = new EventListener();
    const provider = new ethers.providers.JsonRpcProvider();
    const loader = new Directory(eventListener, CHAIN_ID, provider, ADDRESS);
    const session = new ClientSession();

    const userAddress = "0xUSER";
    const ctAddress = "0xCT";
    const ct = new ChargedToken(loader.chainId, provider, ctAddress, loader);
    loader.ct[ctAddress] = ct;

    const ctBalance = { address: ctAddress, balance: "xxx" };

    (ct as any).loadUserBalances.mockResolvedValueOnce(ctBalance);
    (UserBalanceModel as any).exists.mockResolvedValueOnce({});
    (UserBalanceModel as any).find.mockReturnValueOnce({ exec: jest.fn().mockResolvedValue([ctBalance]) });
    (UserBalanceModel as any).toGraphQL.mockResolvedValueOnce(ctBalance);

    // tested function
    const result = await loader.loadAllUserBalances(session, userAddress, BLOCK_NUMBER, ctAddress);

    // expectations
    expect(result).toEqual([ctBalance]);

    expect(ct.loadUserBalances).toHaveBeenNthCalledWith(1, userAddress, BLOCK_NUMBER);
    expect(UserBalanceModel.exists).toHaveBeenNthCalledWith(1, {
      chainId: CHAIN_ID,
      user: userAddress,
      address: ctAddress,
    });
    expect(UserBalanceModel.toModel).not.toBeCalled();
    expect(UserBalanceModel.updateOne).toHaveBeenNthCalledWith(
      1,
      { chainId: CHAIN_ID, user: userAddress, address: ctAddress },
      ctBalance,
      { session },
    );
    expect(UserBalanceModel.find).toHaveBeenNthCalledWith(1, { chainId: CHAIN_ID, user: userAddress }, undefined, {
      session,
    });
    expect(UserBalanceModel.toGraphQL).toBeCalledTimes(1);
    expect(pubSub.publish).toBeCalledTimes(1);
  });

  test("Should subscribe to events and propagate events subscriptions to existing charged tokens", async () => {
    // initialization
    const eventListener = new EventListener();
    const provider = new ethers.providers.JsonRpcProvider();
    const loader = new Directory(eventListener, CHAIN_ID, provider, ADDRESS);

    const ctAddress = "0xCT";
    const ct = new ChargedToken(loader.chainId, provider, ctAddress, loader);
    loader.ct[ctAddress] = ct;

    // tested function
    loader.subscribeToEvents();

    // expectations
    expect(loader.instance.on).toHaveBeenNthCalledWith(1, { address: ADDRESS }, expect.anything());

    expect(ct.subscribeToEvents).toBeCalledTimes(1);
  });

  test("destroy", async () => {
    // initialization
    const provider = new ethers.providers.JsonRpcProvider();
    const loader = new Directory(undefined as unknown as EventListener, CHAIN_ID, provider, ADDRESS);

    loader.ct.x = new ChargedToken(CHAIN_ID, provider, ADDRESS, loader);
    loader.ct.y = new ChargedToken(CHAIN_ID, provider, ADDRESS, loader);

    await loader.destroy();

    expect(loader.ct.x.destroy).toBeCalledTimes(1);
    expect(loader.ct.y.destroy).toBeCalledTimes(1);
    expect(loader.instance.removeAllListeners).toBeCalledTimes(1);
  });

  // Event handlers
  test("Events routing", async () => {
    // initialization
    const provider = new ethers.providers.JsonRpcProvider();
    const loader = new Directory(undefined as unknown as EventListener, CHAIN_ID, provider, ADDRESS);
    const session = new ClientSession();

    const eventName = "OwnershipTransferred";
    const eventHandler = jest.spyOn(loader, "onOwnershipTransferredEvent");

    const BLOCK_NUMBER = 15;

    // handler under test
    await loader.onEvent(session, eventName, ["any_arg"], BLOCK_NUMBER, {
      blockNumber: BLOCK_NUMBER,
      blockHash: "0x",
      address: "0x",
      data: "0x",
      logIndex: 0,
      transactionIndex: 0,
      removed: false,
      topics: [],
      transactionHash: "0x",
    });

    expect(eventHandler).toHaveBeenNthCalledWith(
      1,
      session,
      ["any_arg"],
      BLOCK_NUMBER,
      "Directory.onOwnershipTransferredEvent",
    );
  });

  test("UserFunctionsAreDisabled", async () => {
    // initialization
    const provider = new ethers.providers.JsonRpcProvider();
    const loader = new Directory(undefined as unknown as EventListener, CHAIN_ID, provider, ADDRESS);
    const session = new ClientSession();

    const loadedModel = sampleData();

    (loader.model as any).exists.mockResolvedValueOnce("not_null");
    (loader.model as any).toGraphQL.mockReturnValueOnce(loadedModel);

    await loader.onUserFunctionsAreDisabledEvent(session, [true], BLOCK_NUMBER, "UserFunctionsAreDisabled");

    expect((loader.model as any).exists).toBeCalledTimes(1);
    expect((loader.model as any).findOne).toBeCalledTimes(1);
    expect((loader.model as any).updateOne).toHaveBeenCalledWith(
      { chainId: CHAIN_ID, address: ADDRESS },
      { lastUpdateBlock: BLOCK_NUMBER, areUserFunctionsDisabled: true },
      { session },
    );
    expect(pubSub.publish).toHaveBeenCalledWith(`Directory.${CHAIN_ID}.${ADDRESS}`, loadedModel);
    expect(pubSub.publish).toHaveBeenCalledWith(`Directory.${CHAIN_ID}`, loadedModel);
  });

  test("ProjectOwnerWhitelisted", async () => {
    // initialization
    const provider = new ethers.providers.JsonRpcProvider();
    const loader = new Directory(undefined as unknown as EventListener, CHAIN_ID, provider, ADDRESS);
    const session = new ClientSession();

    const PROJECT_OWNER = "0xPROJ_OWNER";
    const PROJECT_NAME = "Project name";

    const loadedModel = {
      ...sampleData(),
      projects: ["A", "B"],
      whitelistedProjectOwners: ["0xA", "0xB"],
      whitelist: {
        "0xA": "A",
        "0xB": "B",
      },
    };

    const modelInstanceMock = { toJSON: jest.fn(() => loadedModel) };
    (loader.model as any).findOne.mockResolvedValueOnce(modelInstanceMock);

    (loader.model as any).exists.mockResolvedValueOnce("not_null");
    (loader.model as any).toGraphQL.mockReturnValueOnce(loadedModel);

    await loader.onProjectOwnerWhitelistedEvent(
      session,
      [PROJECT_OWNER, PROJECT_NAME],
      BLOCK_NUMBER,
      "ProjectOwnerWhitelisted",
    );

    expect((loader.model as any).exists).toBeCalledTimes(1);
    expect((loader.model as any).findOne).toBeCalledTimes(2);
    expect((loader.model as any).updateOne).toHaveBeenCalledWith(
      { chainId: CHAIN_ID, address: ADDRESS },
      {
        lastUpdateBlock: BLOCK_NUMBER,
        projects: ["A", "B", PROJECT_NAME],
        whitelistedProjectOwners: ["0xA", "0xB", PROJECT_OWNER],
        whitelist: {
          "0xA": "A",
          "0xB": "B",
          [PROJECT_OWNER]: PROJECT_NAME,
        },
      },
      { session },
    );
    expect(pubSub.publish).toHaveBeenCalledWith(`Directory.${CHAIN_ID}.${ADDRESS}`, loadedModel);
    expect(pubSub.publish).toHaveBeenCalledWith(`Directory.${CHAIN_ID}`, loadedModel);
  });

  test("AddedLTContract", async () => {
    // initialization
    const provider = new ethers.providers.JsonRpcProvider();
    const loader = new Directory(undefined as unknown as EventListener, CHAIN_ID, provider, ADDRESS);
    const session = new ClientSession();

    const CONTRACT = "0xCONTRACT";
    const PROJECT = "PROJECT";

    const loadedModel = {
      ...sampleData(),
      directory: ["0xA", "0xB"],
      projectRelatedToLT: {
        "0xA": "A",
      },
    };

    const graphqlModel = {
      ...sampleGraphqlData(),
      projectRelatedToLT: [{ key: "0xA", value: "A" }],
    };

    // mocking init
    (loader.model as any).findOne.mockResolvedValueOnce(loadedModel);
    (loader.model as any).toGraphQL.mockReturnValueOnce(graphqlModel);
    (loader.instance as any).queryFilter.mockResolvedValueOnce([]);

    // initializing directory
    await loader.init(session, BLOCK_NUMBER, true);

    // mocking event handler
    const modelInstanceMock = { save: jest.fn(), toJSON: jest.fn(() => loadedModel) };
    (loader.model as any).findOne.mockResolvedValueOnce(modelInstanceMock);
    (loader.model as any).exists.mockResolvedValueOnce("not_null");
    (loader.model as any).toGraphQL.mockReturnValueOnce(loadedModel);

    loader.instance.projectRelatedToLT.mockResolvedValueOnce(PROJECT);

    // handler under test
    await loader.onAddedLTContractEvent(session, [CONTRACT], BLOCK_NUMBER, "AddedLTContract");

    expect(loader.instance.projectRelatedToLT).toHaveBeenNthCalledWith(1, CONTRACT);

    // new charged token init and subscribe
    expect(loader.ct[CONTRACT]).toBeDefined();
    expect(loader.ct[CONTRACT].init).toHaveBeenNthCalledWith(1, session, BLOCK_NUMBER, false);
    expect(loader.ct[CONTRACT].subscribeToEvents).toBeCalled();

    // applyUpdateAndNotify
    expect((loader.model as any).exists).toBeCalledTimes(1);
    expect((loader.model as any).findOne).toBeCalledTimes(3);
    expect((loader.model as any).updateOne).toHaveBeenCalledWith(
      { chainId: CHAIN_ID, address: ADDRESS },
      {
        lastUpdateBlock: BLOCK_NUMBER,
        directory: ["0xA", "0xB", CONTRACT],
        projectRelatedToLT: {
          "0xA": "A",
          [CONTRACT]: PROJECT,
        },
      },
      { session },
    );
    expect(pubSub.publish).toHaveBeenCalledWith(`Directory.${CHAIN_ID}.${ADDRESS}`, loadedModel);
    expect(pubSub.publish).toHaveBeenCalledWith(`Directory.${CHAIN_ID}`, loadedModel);
  });

  test("OwnershipTransferred", async () => {
    // initialization
    const provider = new ethers.providers.JsonRpcProvider();
    const loader = new Directory(undefined as unknown as EventListener, CHAIN_ID, provider, ADDRESS);
    const session = new ClientSession();

    const updateFunc = jest.spyOn(loader, "applyUpdateAndNotify");

    const NEW_OWNER = "0xOWNER";

    // handler under test
    await loader.onOwnershipTransferredEvent(session, [NEW_OWNER], BLOCK_NUMBER, "OwnershipTransferred");

    expect(updateFunc).toHaveBeenNthCalledWith(1, session, { owner: NEW_OWNER }, BLOCK_NUMBER);
  });

  test("RemovedLTContract", async () => {
    // initialization
    const provider = new ethers.providers.JsonRpcProvider();
    const loader = new Directory(undefined as unknown as EventListener, CHAIN_ID, provider, ADDRESS);
    const session = new ClientSession();

    const ctAddress = "0xCT";
    const ct = new ChargedToken(CHAIN_ID, provider, ctAddress, loader);
    loader.ct[ctAddress] = ct;

    const ctAddressNotToRemove = "0xCT2";

    const loadedModel = {
      address: ADDRESS,
      directory: [ctAddressNotToRemove, ctAddress],
      projectRelatedToLT: {
        [ctAddressNotToRemove]: "SOME PROJECT",
        [ctAddress]: "ANOTHER PROJECT",
      },
      toJSON: jest.fn(),
    };

    const loadedInterface = {
      address: "0xIFACE",
      projectToken: "0xPT",
    };

    loadedModel.toJSON.mockReturnValueOnce(loadedModel);

    (DirectoryModel as any).findOne.mockResolvedValueOnce(loadedModel);
    (InterfaceProjectTokenModel as any).findOne.mockResolvedValueOnce(loadedInterface);
    (DelegableToLTModel as any).count.mockResolvedValueOnce(1);

    const updateFunc = jest.spyOn(loader, "applyUpdateAndNotify");

    // handler under test
    await loader.onRemovedLTContractEvent(session, [ctAddress], BLOCK_NUMBER, "RemovedLTContractEvent");

    expect((DirectoryModel as any).findOne).toBeCalled();
    expect(loadedModel.toJSON).toBeCalledTimes(1);
    expect(ct.destroy).toBeCalledTimes(1);
    expect(loader.ct[ctAddress]).toBeUndefined();
    expect(ChargedTokenModel.deleteOne).toHaveBeenNthCalledWith(
      1,
      { chainId: CHAIN_ID, address: ctAddress },
      { session },
    );

    expect(InterfaceProjectTokenModel.findOne).toHaveBeenNthCalledWith(
      1,
      { chainId: CHAIN_ID, liquidityToken: ctAddress },
      undefined,
      { session },
    );
    expect(InterfaceProjectTokenModel.deleteOne).toHaveBeenNthCalledWith(
      1,
      { chainId: CHAIN_ID, address: loadedInterface.address },
      { session },
    );

    expect(DelegableToLTModel.deleteOne).toHaveBeenNthCalledWith(
      1,
      { chainId: CHAIN_ID, address: loadedInterface.projectToken },
      { session },
    );

    expect(UserBalanceModel.deleteMany).toHaveBeenNthCalledWith(
      1,
      { chainId: CHAIN_ID, address: { $in: [ctAddress, loadedInterface.address, loadedInterface.projectToken] } },
      { session },
    );

    expect(updateFunc).toHaveBeenNthCalledWith(
      1,
      session,
      {
        directory: [ctAddressNotToRemove],
        projectRelatedToLT: {
          [ctAddressNotToRemove]: "SOME PROJECT",
        },
      },
      BLOCK_NUMBER,
      "RemovedLTContractEvent",
    );
  });

  test("RemovedProjectByAdmin", async () => {
    // initialization
    const provider = new ethers.providers.JsonRpcProvider();
    const loader = new Directory(undefined as unknown as EventListener, CHAIN_ID, provider, ADDRESS);
    const session = new ClientSession();

    const updateFunc = jest.spyOn(loader, "applyUpdateAndNotify");

    const ownerToRemove = "0xOWNER_TO_REMOVE";

    const loadedModel = {
      address: ADDRESS,
      directory: ["0xCT1", "0xCT2"],
      projects: ["Project 1", "Project 2"],
      whitelistedProjectOwners: ["0xFirst_owner", ownerToRemove],
      whitelist: {
        "0xFirst_owner": "Project 1",
        [ownerToRemove]: "Project 2",
      },
      projectRelatedToLT: {
        "0xCT1": "Project 1",
        "0xCT2": "Project 2",
      },
      toJSON: jest.fn(),
    };

    loadedModel.toJSON.mockReturnValueOnce(loadedModel);
    (DirectoryModel as any).findOne.mockResolvedValueOnce(loadedModel);

    // handler under test
    await loader.onRemovedProjectByAdminEvent(session, [ownerToRemove], BLOCK_NUMBER, "RemovedProjectByAdmin");

    expect(updateFunc).toHaveBeenNthCalledWith(
      1,
      session,
      {
        projects: ["Project 1"],
        whitelistedProjectOwners: ["0xFirst_owner"],
        whitelist: {
          "0xFirst_owner": "Project 1",
        },
      },
      BLOCK_NUMBER,
      "RemovedProjectByAdmin",
    );
  });

  test("ChangedProjectOwnerAccount", async () => {
    // initialization
    const provider = new ethers.providers.JsonRpcProvider();
    const loader = new Directory(undefined as unknown as EventListener, CHAIN_ID, provider, ADDRESS);
    const session = new ClientSession();

    const updateFunc = jest.spyOn(loader, "applyUpdateAndNotify");

    const oldOwner = "0xOLD_OWNER";
    const newOwner = "0xNEW_OWNER";

    const loadedModel = {
      address: ADDRESS,
      directory: ["0xCT1", "0xCT2"],
      projects: ["Project 1", "Project 2"],
      whitelistedProjectOwners: [oldOwner, "0xSecond_owner"],
      whitelist: {
        [oldOwner]: "Project 1",
        "0xSecond_owner": "Project 2",
      },
      projectRelatedToLT: {
        "0xCT1": "Project 1",
        "0xCT2": "Project 2",
      },
      toJSON: jest.fn(),
    };

    loadedModel.toJSON.mockReturnValueOnce(loadedModel);
    (DirectoryModel as any).findOne.mockResolvedValueOnce(loadedModel);

    // handler under test
    await loader.onChangedProjectOwnerAccountEvent(
      session,
      [oldOwner, newOwner],
      BLOCK_NUMBER,
      "ChangedProjectOwnerAccount",
    );

    expect(updateFunc).toHaveBeenNthCalledWith(
      1,
      session,
      {
        whitelistedProjectOwners: ["0xSecond_owner", newOwner],
        whitelist: {
          [newOwner]: "Project 1",
          "0xSecond_owner": "Project 2",
        },
      },
      BLOCK_NUMBER,
      "ChangedProjectOwnerAccount",
    );
  });

  test("ChangedProjectName", async () => {
    // initialization
    const provider = new ethers.providers.JsonRpcProvider();
    const loader = new Directory(undefined as unknown as EventListener, CHAIN_ID, provider, ADDRESS);
    const session = new ClientSession();

    const updateFunc = jest.spyOn(loader, "applyUpdateAndNotify");

    const oldName = "Project 1";
    const newName = "Project 11";

    const loadedModel = {
      address: ADDRESS,
      directory: ["0xCT1", "0xCT2"],
      projects: [oldName, "Project 2"],
      whitelistedProjectOwners: ["0xFirst_owner", "0xSecond_owner"],
      whitelist: {
        "0xFirst_owner": "Project 1",
        "0xSecond_owner": "Project 2",
      },
      projectRelatedToLT: {
        "0xCT1": "Project 1",
        "0xCT2": "Project 2",
      },
      toJSON: jest.fn(),
    };

    loadedModel.toJSON.mockReturnValueOnce(loadedModel);
    (DirectoryModel as any).findOne.mockResolvedValueOnce(loadedModel);

    // handler under test
    await loader.onChangedProjectNameEvent(session, [oldName, newName], BLOCK_NUMBER, "ChangedProjectName");

    expect(updateFunc).toHaveBeenNthCalledWith(
      1,
      session,
      {
        projects: ["Project 2", newName],
      },
      BLOCK_NUMBER,
      "ChangedProjectName",
    );
  });

  test("AllocatedLTToProject", async () => {
    // initialization
    const provider = new ethers.providers.JsonRpcProvider();
    const loader = new Directory(undefined as unknown as EventListener, CHAIN_ID, provider, ADDRESS);
    const session = new ClientSession();

    const updateFunc = jest.spyOn(loader, "applyUpdateAndNotify");

    const newCT = "0xCT2";

    const loadedModel = {
      address: ADDRESS,
      directory: ["0xCT1"],
      projects: ["Project 1", "Project 2"],
      whitelistedProjectOwners: ["0xFirst_owner", "0xSecond_owner"],
      whitelist: {
        "0xFirst_owner": "Project 1",
        "0xSecond_owner": "Project 2",
      },
      projectRelatedToLT: {
        "0xCT1": "Project 1",
      },
      toJSON: jest.fn(),
    };

    loadedModel.toJSON.mockReturnValueOnce(loadedModel);
    (DirectoryModel as any).findOne.mockResolvedValueOnce(loadedModel);

    // handler under test
    await loader.onAllocatedLTToProjectEvent(session, [newCT, "Project 2"], BLOCK_NUMBER, "AllocatedLTToProject");

    expect(updateFunc).toHaveBeenNthCalledWith(
      1,
      session,
      {
        projectRelatedToLT: {
          "0xCT1": "Project 1",
          [newCT]: "Project 2",
        },
      },
      BLOCK_NUMBER,
      "AllocatedLTToProject",
    );
  });

  test("AllocatedProjectOwnerToProject", async () => {
    // initialization
    const provider = new ethers.providers.JsonRpcProvider();
    const loader = new Directory(undefined as unknown as EventListener, CHAIN_ID, provider, ADDRESS);
    const session = new ClientSession();

    const updateFunc = jest.spyOn(loader, "applyUpdateAndNotify");

    const newOwner = "0xNEW_OWNER";

    const loadedModel = {
      address: ADDRESS,
      directory: ["0xCT1"],
      projects: ["Project 1", "Project 2"],
      whitelistedProjectOwners: ["0xFirst_owner", "0xSecond_owner"],
      whitelist: {
        "0xFirst_owner": "Project 1",
      },
      projectRelatedToLT: {
        "0xCT1": "Project 1",
      },
      toJSON: jest.fn(),
    };

    loadedModel.toJSON.mockReturnValueOnce(loadedModel);
    (DirectoryModel as any).findOne.mockResolvedValueOnce(loadedModel);

    // handler under test
    await loader.onAllocatedProjectOwnerToProjectEvent(
      session,
      [newOwner, "Project 2"],
      BLOCK_NUMBER,
      "AllocatedProjectOwnerToProject",
    );

    expect(updateFunc).toHaveBeenNthCalledWith(
      1,
      session,
      {
        whitelist: {
          "0xFirst_owner": "Project 1",
          [newOwner]: "Project 2",
        },
      },
      BLOCK_NUMBER,
      "AllocatedProjectOwnerToProject",
    );
  });
});
