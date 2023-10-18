import { BigNumber, ethers } from "ethers";
import { ClientSession } from "mongodb";
import { Directory } from "./Directory";
import { EventListener } from "./EventListener";

jest.mock("./EventListener");
jest.mock("../topics");
jest.mock("../graphql");
jest.mock("../models");

describe("Directory loader", () => {
  const CHAIN_ID = 1337;
  const OWNER = "0x493942A95Bc6Db03CE8Cc22ff5a0441Dcc581f45";
  const ADDRESS = "0xF79A6c67E99b2135E09C3Ba0d06AE60977C1f393";

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
    const BLOCK_NUMBER = 15;

    (provider as any).getBlockNumber.mockImplementationOnce(() => BLOCK_NUMBER);

    // mocking mongo model
    const graphqlModel = {
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

    const modelInstanceMock = { save: jest.fn() };
    (loader.model as any).toModel.mockImplementationOnce(
      () => modelInstanceMock
    );
    (loader.model as any).exists.mockImplementationOnce(async () => null);
    (loader.model as any).toGraphQL.mockImplementationOnce(() => {
      return graphqlModel;
    });

    // mocking contract instance
    loader.instance.countWhitelistedProjectOwners.mockImplementationOnce(
      async () => BigNumber.from(0)
    );
    loader.instance.countLTContracts.mockImplementationOnce(async () =>
      BigNumber.from(0)
    );
    loader.instance.owner.mockImplementationOnce(async () => OWNER);
    loader.instance.areUserFunctionsDisabled.mockImplementationOnce(
      async () => false
    );

    // tested function
    await loader.init(session, undefined, true);

    // expectations
    expect(loader.initBlock).toBe(BLOCK_NUMBER);
    expect(loader.lastUpdateBlock).toBe(BLOCK_NUMBER);
    expect(loader.actualBlock).toBe(BLOCK_NUMBER);
    expect(loader.lastState).toEqual(graphqlModel);

    expect((loader.model as any).exists).toBeCalledTimes(1);
    expect((loader.model as any).findOne).toBeCalledTimes(2);
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
    (loader.model as any).toModel.mockImplementationOnce(
      () => modelInstanceMock
    );
    (loader.model as any).findOne.mockImplementationOnce(
      async () => loadedModel
    );
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
    expect((loader.model as any).findOne).toBeCalledTimes(1);
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
});
