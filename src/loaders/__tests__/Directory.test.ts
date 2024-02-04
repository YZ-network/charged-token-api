import { BigNumber, ethers } from "ethers";
import { ClientSession } from "mongodb";
import { pubSub } from "../../graphql";
import { IInterfaceProjectToken, IUserBalance } from "../../models";
import { DataType } from "../../types";
import { AbstractDbRepository } from "../AbstractDbRepository";
import { ChargedToken } from "../ChargedToken";
import { Directory } from "../Directory";
import { EventListener } from "../EventListener";
import { MockDbRepository } from "../__mocks__/MockDbRepository";

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

  let eventListener: EventListener;
  let provider: ethers.providers.JsonRpcProvider;
  let db: jest.Mocked<AbstractDbRepository>;
  let loader: Directory;
  let session: ClientSession;

  beforeEach(() => {
    provider = new ethers.providers.JsonRpcProvider();
    db = new MockDbRepository() as jest.Mocked<AbstractDbRepository>;
    eventListener = new EventListener(db, false);
    loader = new Directory(eventListener, CHAIN_ID, provider, ADDRESS, db as unknown as AbstractDbRepository);
    session = new ClientSession();
  });

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

    db.get.mockResolvedValueOnce(null).mockResolvedValueOnce(graphqlModel);

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

    expect(db.exists).toBeCalledTimes(1);
    expect(db.get).toHaveBeenNthCalledWith(2, DataType.Directory, CHAIN_ID, ADDRESS);
    expect(db.save).toHaveBeenCalledTimes(1);

    expect(loader.instance.countWhitelistedProjectOwners).toBeCalledTimes(1);
    expect(loader.instance.countLTContracts).toBeCalledTimes(1);
    expect(loader.instance.owner).toBeCalledTimes(1);
    expect(loader.instance.areUserFunctionsDisabled).toBeCalledTimes(1);
    expect(loader.instance.queryFilter).toBeCalledTimes(0);

    expect((session as any).startTransaction).toBeCalledTimes(1);
    expect((session as any).commitTransaction).toBeCalledTimes(1);
  });

  test("Should use events to update existing Directory from db", async () => {
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

    db.get.mockResolvedValueOnce(loadedModel);

    // mocking contract instance
    (loader.instance as any).queryFilter.mockResolvedValueOnce(() => []);

    // tested function
    await loader.init(session, BLOCK_NUMBER, true);

    // expectations
    expect(loader.initBlock).toBe(PREV_BLOCK_NUMBER);
    expect(loader.lastUpdateBlock).toBe(PREV_BLOCK_NUMBER);
    expect(loader.lastState).toEqual(loadedModel);

    expect(db.exists).toBeCalledTimes(0);
    expect(db.get).toHaveBeenNthCalledWith(1, DataType.Directory, CHAIN_ID, ADDRESS);
    expect(db.save).toHaveBeenCalledTimes(0);

    expect(loader.instance.countWhitelistedProjectOwners).toBeCalledTimes(0);
    expect(loader.instance.countLTContracts).toBeCalledTimes(0);
    expect(loader.instance.owner).toBeCalledTimes(0);
    expect(loader.instance.areUserFunctionsDisabled).toBeCalledTimes(0);
    expect(loader.instance.queryFilter).toBeCalledTimes(1);

    expect((session as any).startTransaction).toBeCalledTimes(1);
    expect((session as any).commitTransaction).toBeCalledTimes(1);
  });

  test("Should initialize available charged tokens", async () => {
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

    db.get.mockResolvedValueOnce(loadedModel);

    // mocking contract instance
    (loader.instance as any).queryFilter.mockResolvedValueOnce([]);

    // tested function
    await loader.init(session, BLOCK_NUMBER, true);

    // expectations
    expect(loader.lastState).toEqual(loadedModel);
    expect(Object.keys(loader.ct).length).toBe(1);
    expect(loader.ct["0xCT"]).toBeDefined();
    expect((loader.ct["0xCT"] as any).init).toHaveBeenNthCalledWith(1, session, BLOCK_NUMBER, true);
  });

  test("Should propagate user balances loading and save them for the first time", async () => {
    const userAddress = "0xUSER";
    const ctAddress = "0xCT";
    const ct = new ChargedToken(loader.chainId, provider, ctAddress, loader, db);
    loader.ct[ctAddress] = ct;

    const ctBalance = { address: ctAddress, balance: "xxx" } as IUserBalance;

    (ct as any).loadUserBalances.mockResolvedValueOnce(ctBalance);
    db.existsBalance.mockResolvedValueOnce(false);
    db.getBalances.mockResolvedValue([ctBalance]);

    // tested function
    const result = await loader.loadAllUserBalances(session, userAddress, BLOCK_NUMBER, ctAddress);

    // expectations
    expect(result).toEqual([ctBalance]);

    expect(ct.loadUserBalances).toHaveBeenNthCalledWith(1, userAddress, BLOCK_NUMBER);
    expect(db.existsBalance).toHaveBeenNthCalledWith(1, CHAIN_ID, ctAddress, userAddress);
    expect(db.saveBalance).toHaveBeenNthCalledWith(1, ctBalance);
    expect(db.getBalances).toHaveBeenNthCalledWith(1, CHAIN_ID, userAddress);
    expect(pubSub.publish).toBeCalledTimes(1);
  });

  test("Should propagate user balances loading and update them when existing", async () => {
    const userAddress = "0xUSER";
    const ctAddress = "0xCT";
    const ct = new ChargedToken(loader.chainId, provider, ctAddress, loader, db);
    loader.ct[ctAddress] = ct;

    const ctBalance = { address: ctAddress, balance: "xxx" } as IUserBalance;

    (ct as any).loadUserBalances.mockResolvedValueOnce(ctBalance);
    db.existsBalance.mockResolvedValueOnce(true);
    db.getBalances.mockResolvedValue([ctBalance]);

    // tested function
    const result = await loader.loadAllUserBalances(session, userAddress, BLOCK_NUMBER, ctAddress);

    // expectations
    expect(result).toEqual([ctBalance]);

    expect(ct.loadUserBalances).toHaveBeenNthCalledWith(1, userAddress, BLOCK_NUMBER);
    expect(db.existsBalance).toHaveBeenNthCalledWith(1, CHAIN_ID, ctAddress, userAddress);
    expect(db.updateBalance).toHaveBeenNthCalledWith(1, {
      ...ctBalance,
      chainId: CHAIN_ID,
      user: userAddress,
      address: ctAddress,
    });
    expect(db.getBalances).toHaveBeenNthCalledWith(1, CHAIN_ID, userAddress);
    expect(pubSub.publish).toBeCalledTimes(1);
  });

  test("Should subscribe to events and propagate events subscriptions to existing charged tokens", async () => {
    const ctAddress = "0xCT";
    const ct = new ChargedToken(loader.chainId, provider, ctAddress, loader, db);
    loader.ct[ctAddress] = ct;

    // tested function
    loader.subscribeToEvents();

    // expectations
    expect(loader.instance.on).toHaveBeenNthCalledWith(1, { address: ADDRESS }, expect.anything());

    expect(ct.subscribeToEvents).toBeCalledTimes(1);
  });

  test("destroy", async () => {
    loader.ct.x = new ChargedToken(CHAIN_ID, provider, ADDRESS, loader, db);
    loader.ct.y = new ChargedToken(CHAIN_ID, provider, ADDRESS, loader, db);

    await loader.destroy();

    expect(loader.ct.x.destroy).toBeCalledTimes(1);
    expect(loader.ct.y.destroy).toBeCalledTimes(1);
    expect(loader.instance.removeAllListeners).toBeCalledTimes(1);
  });

  // Event handlers
  test("Events routing", async () => {
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
    const loadedModel = sampleData();

    db.exists.mockResolvedValueOnce(true);
    db.get.mockResolvedValueOnce(loadedModel);

    await loader.onUserFunctionsAreDisabledEvent(session, [true], BLOCK_NUMBER, "UserFunctionsAreDisabled");

    expect(db.exists).toBeCalledTimes(1);
    expect(db.get).toBeCalledTimes(1);
    expect(db.update).toHaveBeenCalledWith(DataType.Directory, {
      chainId: CHAIN_ID,
      address: ADDRESS,
      lastUpdateBlock: BLOCK_NUMBER,
      areUserFunctionsDisabled: true,
    });
    expect(pubSub.publish).toHaveBeenCalledWith(`Directory.${CHAIN_ID}.${ADDRESS}`, loadedModel);
    expect(pubSub.publish).toHaveBeenCalledWith(`Directory.${CHAIN_ID}`, loadedModel);
  });

  test("ProjectOwnerWhitelisted", async () => {
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

    db.get.mockResolvedValue(loadedModel);
    db.exists.mockResolvedValueOnce(true);

    await loader.onProjectOwnerWhitelistedEvent(
      session,
      [PROJECT_OWNER, PROJECT_NAME],
      BLOCK_NUMBER,
      "ProjectOwnerWhitelisted",
    );

    expect(db.exists).toBeCalledTimes(1);
    expect(db.get).toBeCalledTimes(2);
    expect(db.update).toHaveBeenCalledWith(DataType.Directory, {
      chainId: CHAIN_ID,
      address: ADDRESS,
      lastUpdateBlock: BLOCK_NUMBER,
      projects: ["A", "B", PROJECT_NAME],
      whitelistedProjectOwners: ["0xA", "0xB", PROJECT_OWNER],
      whitelist: {
        "0xA": "A",
        "0xB": "B",
        [PROJECT_OWNER]: PROJECT_NAME,
      },
    });
    expect(pubSub.publish).toHaveBeenCalledWith(`Directory.${CHAIN_ID}.${ADDRESS}`, loadedModel);
    expect(pubSub.publish).toHaveBeenCalledWith(`Directory.${CHAIN_ID}`, loadedModel);
  });

  test("AddedLTContract", async () => {
    const CONTRACT = "0xCONTRACT";
    const PROJECT = "PROJECT";

    const loadedModel = {
      ...sampleData(),
      directory: ["0xA", "0xB"],
      projectRelatedToLT: {
        "0xA": "A",
      },
    };

    // mocking init
    db.get.mockResolvedValueOnce(loadedModel);
    (loader.instance as any).queryFilter.mockResolvedValueOnce([]);

    // initializing directory
    await loader.init(session, BLOCK_NUMBER, true);

    // mocking event handler
    db.get.mockResolvedValue(loadedModel);
    db.exists.mockResolvedValueOnce(true);

    loader.instance.projectRelatedToLT.mockResolvedValueOnce(PROJECT);

    // handler under test
    await loader.onAddedLTContractEvent(session, [CONTRACT], BLOCK_NUMBER, "AddedLTContract");

    expect(loader.instance.projectRelatedToLT).toHaveBeenNthCalledWith(1, CONTRACT);

    // new charged token init and subscribe
    expect(loader.ct[CONTRACT]).toBeDefined();
    expect(loader.ct[CONTRACT].init).toHaveBeenNthCalledWith(1, session, BLOCK_NUMBER, false);
    expect(loader.ct[CONTRACT].subscribeToEvents).toBeCalled();

    // applyUpdateAndNotify
    expect(db.exists).toBeCalledTimes(1);
    expect(db.get).toBeCalledTimes(3);
    expect(db.update).toHaveBeenCalledWith(DataType.Directory, {
      chainId: CHAIN_ID,
      address: ADDRESS,
      lastUpdateBlock: BLOCK_NUMBER,
      directory: ["0xA", "0xB", CONTRACT],
      projectRelatedToLT: {
        "0xA": "A",
        [CONTRACT]: PROJECT,
      },
    });
    expect(pubSub.publish).toHaveBeenCalledWith(`Directory.${CHAIN_ID}.${ADDRESS}`, loadedModel);
    expect(pubSub.publish).toHaveBeenCalledWith(`Directory.${CHAIN_ID}`, loadedModel);
  });

  test("OwnershipTransferred", async () => {
    const updateFunc = jest.spyOn(loader, "applyUpdateAndNotify");

    const NEW_OWNER = "0xOWNER";

    // handler under test
    await loader.onOwnershipTransferredEvent(session, [NEW_OWNER], BLOCK_NUMBER, "OwnershipTransferred");

    expect(updateFunc).toHaveBeenNthCalledWith(1, session, { owner: NEW_OWNER }, BLOCK_NUMBER);
  });

  test("RemovedLTContract", async () => {
    const ctAddress = "0xCT";
    const ct = new ChargedToken(CHAIN_ID, provider, ctAddress, loader, db);
    loader.ct[ctAddress] = ct;

    const ctAddressNotToRemove = "0xCT2";

    const loadedModel = {
      address: ADDRESS,
      directory: [ctAddressNotToRemove, ctAddress],
      projectRelatedToLT: {
        [ctAddressNotToRemove]: "SOME PROJECT",
        [ctAddress]: "ANOTHER PROJECT",
      },
    };

    const loadedInterface = {
      address: "0xIFACE",
      projectToken: "0xPT",
    } as IInterfaceProjectToken;

    db.get.mockResolvedValue(loadedModel);
    db.getInterfaceByChargedToken.mockResolvedValueOnce(loadedInterface);
    db.exists.mockResolvedValueOnce(true);

    const updateFunc = jest.spyOn(loader, "applyUpdateAndNotify");

    // handler under test
    await loader.onRemovedLTContractEvent(session, [ctAddress], BLOCK_NUMBER, "RemovedLTContractEvent");

    expect(db.get).toBeCalledTimes(2);
    expect(db.getInterfaceByChargedToken).toBeCalledTimes(1);
    expect(ct.destroy).toBeCalledTimes(1);
    expect(loader.ct[ctAddress]).toBeUndefined();
    expect(db.delete).toHaveBeenNthCalledWith(1, DataType.ChargedToken, CHAIN_ID, ctAddress);

    expect(db.getInterfaceByChargedToken).toHaveBeenNthCalledWith(1, CHAIN_ID, ctAddress);
    expect(db.delete).toHaveBeenNthCalledWith(2, DataType.InterfaceProjectToken, CHAIN_ID, loadedInterface.address);

    expect(db.delete).toHaveBeenNthCalledWith(3, DataType.DelegableToLT, CHAIN_ID, loadedInterface.projectToken);

    expect(db.delete).toHaveBeenNthCalledWith(4, DataType.UserBalance, CHAIN_ID, [
      ctAddress,
      loadedInterface.address,
      loadedInterface.projectToken,
    ]);

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
    };

    db.get.mockResolvedValueOnce(loadedModel);

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
    };

    db.get.mockResolvedValueOnce(loadedModel);

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
    };

    db.get.mockResolvedValueOnce(loadedModel);

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
    };

    db.get.mockResolvedValueOnce(loadedModel);

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
    };

    db.get.mockResolvedValueOnce(loadedModel);

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
