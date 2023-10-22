import { BigNumber, ethers } from "ethers";
import { ClientSession } from "mongodb";
import { pubSub } from "../../graphql";
import { ChargedToken } from "../ChargedToken";
import { Directory } from "../Directory";
import { EventListener } from "../EventListener";

jest.mock("../EventListener");
jest.mock("../../topics");
jest.mock("../../graphql");
jest.mock("../../models");
jest.mock("../ChargedToken");

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
    expect(loader.actualBlock).toBe(0);
    expect(loader.lastUpdateBlock).toBe(0);
    expect(loader.lastState).toEqual(undefined);

    // mocking ethers
    (provider as any).getBlockNumber.mockImplementationOnce(() => BLOCK_NUMBER);

    // mocking mongo model
    const graphqlModel = sampleGraphqlData();

    const modelInstanceMock = { save: jest.fn() };
    (loader.model as any).toModel.mockImplementationOnce(() => modelInstanceMock);
    (loader.model as any).exists.mockImplementationOnce(async () => null);
    (loader.model as any).toGraphQL.mockImplementationOnce(() => {
      return graphqlModel;
    });

    // mocking contract instance
    loader.instance.countWhitelistedProjectOwners.mockImplementationOnce(async () => BigNumber.from(0));
    loader.instance.countLTContracts.mockImplementationOnce(async () => BigNumber.from(0));
    loader.instance.owner.mockImplementationOnce(async () => OWNER);
    loader.instance.areUserFunctionsDisabled.mockImplementationOnce(async () => false);

    // tested function
    await loader.init(session, undefined, true);

    // expectations
    expect(loader.initBlock).toBe(BLOCK_NUMBER);
    expect(loader.lastUpdateBlock).toBe(BLOCK_NUMBER);
    expect(loader.actualBlock).toBe(BLOCK_NUMBER);
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

    (provider as any).getBlockNumber.mockImplementationOnce(() => BLOCK_NUMBER);

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
    (loader.model as any).toModel.mockImplementationOnce(() => modelInstanceMock);
    (loader.model as any).findOne.mockImplementationOnce(async () => loadedModel);
    (loader.model as any).toGraphQL.mockImplementationOnce(() => {
      return graphqlModel;
    });

    // mocking contract instance
    (loader.instance as any).queryFilter.mockImplementationOnce(() => []);

    // tested function
    await loader.init(session, undefined, true);

    // expectations
    expect(loader.initBlock).toBe(PREV_BLOCK_NUMBER);
    expect(loader.lastUpdateBlock).toBe(PREV_BLOCK_NUMBER);
    expect(loader.actualBlock).toBe(BLOCK_NUMBER);
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
  test("UserFunctionsAreDisabled", async () => {
    // initialization
    const provider = new ethers.providers.JsonRpcProvider();
    const loader = new Directory(undefined as unknown as EventListener, CHAIN_ID, provider, ADDRESS);
    const session = new ClientSession();

    loader.actualBlock = BLOCK_NUMBER;

    const loadedModel = sampleData();

    (loader.model as any).exists.mockImplementationOnce(async () => "not_null");
    (loader.model as any).toGraphQL.mockImplementationOnce(() => loadedModel);

    await loader.onUserFunctionsAreDisabledEvent(session, [true], "UserFunctionsAreDisabled");

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

    loader.actualBlock = BLOCK_NUMBER;

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
    (loader.model as any).findOne.mockImplementationOnce(async () => modelInstanceMock);

    (loader.model as any).exists.mockImplementationOnce(async () => "not_null");
    (loader.model as any).toGraphQL.mockImplementationOnce(() => loadedModel);

    await loader.onProjectOwnerWhitelistedEvent(session, [PROJECT_OWNER, PROJECT_NAME], "ProjectOwnerWhitelisted");

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

    loader.actualBlock = BLOCK_NUMBER;

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
    (loader.model as any).findOne.mockImplementationOnce(async () => loadedModel);
    (loader.model as any).toGraphQL.mockImplementationOnce(() => {
      return graphqlModel;
    });
    (loader.instance as any).queryFilter.mockImplementationOnce(() => []);

    // initializing directory
    await loader.init(session, BLOCK_NUMBER, true);

    // mocking event handler
    const modelInstanceMock = { save: jest.fn(), toJSON: jest.fn(() => loadedModel) };
    (loader.model as any).findOne.mockImplementationOnce(async () => modelInstanceMock);
    (loader.model as any).exists.mockImplementationOnce(async () => "not_null");
    (loader.model as any).toGraphQL.mockImplementationOnce(() => loadedModel);

    loader.instance.projectRelatedToLT.mockImplementationOnce(async () => PROJECT);

    // handler under test
    await loader.onAddedLTContractEvent(session, [CONTRACT], "AddedLTContract");

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
});
