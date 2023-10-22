import { BigNumber, ethers } from "ethers";
import { ClientSession } from "mongodb";
import { ChargedToken } from "../ChargedToken";
import { DelegableToLT } from "../DelegableToLT";
import { Directory } from "../Directory";
import { type EventListener } from "../EventListener";

jest.mock("../EventListener");
jest.mock("../../topics");
jest.mock("../../graphql");
jest.mock("../../models");
jest.mock("../Directory");
jest.mock("../ChargedToken");

describe("DelegableToLT loader", () => {
  const CHAIN_ID = 1337;
  const OWNER = "0x493942A95Bc6Db03CE8Cc22ff5a0441Dcc581f45";
  const ADDRESS = "0xF79A6c67E99b2135E09C3Ba0d06AE60977C1f393";
  const NAME = "Test CT";
  const SYMBOL = "TCT";

  test("Should initialize DelegableToLT by reading blockchain when not in db", async () => {
    // initialization
    const provider = new ethers.providers.JsonRpcProvider();
    const directoryLoader = new Directory(undefined as unknown as EventListener, CHAIN_ID, provider, ADDRESS);
    const ctLoader = new ChargedToken(CHAIN_ID, provider, ADDRESS, directoryLoader);
    const loader = new DelegableToLT(CHAIN_ID, provider, ADDRESS, directoryLoader, ctLoader);
    const session = new ClientSession();

    // checking constructor
    expect(loader.chainId).toBe(CHAIN_ID);
    expect(loader.provider).toBe(provider);
    expect(loader.eventsListener).toBe(directoryLoader.eventsListener);
    expect(loader.directory).toBe(directoryLoader);
    expect(loader.ct).toBe(ctLoader);
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
      name: NAME,
      symbol: SYMBOL,
      decimals: "18",
      totalSupply: "1",
      validatedInterfaceProjectToken: ["0xADDR"],
      isListOfInterfaceProjectTokenComplete: false,
    };

    const modelInstanceMock = { save: jest.fn() };
    (loader.model as any).toModel.mockImplementationOnce(() => modelInstanceMock);
    (loader.model as any).exists.mockImplementationOnce(async () => null);
    (loader.model as any).toGraphQL.mockImplementationOnce(() => {
      return graphqlModel;
    });

    // mocking contract instance
    loader.instance.owner.mockImplementationOnce(async () => OWNER);
    loader.instance.name.mockImplementationOnce(async () => NAME);
    loader.instance.symbol.mockImplementationOnce(async () => SYMBOL);
    loader.instance.decimals.mockImplementationOnce(async () => BigNumber.from(18));
    loader.instance.totalSupply.mockImplementationOnce(async () => BigNumber.from(1));
    loader.instance.countValidatedInterfaceProjectToken.mockImplementationOnce(async () => BigNumber.from(1));
    loader.instance.getValidatedInterfaceProjectToken.mockImplementationOnce(async () => "0xADDR");
    loader.instance.isListOfInterfaceProjectTokenComplete.mockImplementationOnce(async () => false);

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

    expect(loader.instance.owner).toBeCalledTimes(1);
    expect(loader.instance.name).toBeCalledTimes(1);
    expect(loader.instance.symbol).toBeCalledTimes(1);
    expect(loader.instance.decimals).toBeCalledTimes(1);
    expect(loader.instance.totalSupply).toBeCalledTimes(1);
    expect(loader.instance.countValidatedInterfaceProjectToken).toBeCalledTimes(1);
    expect(loader.instance.isListOfInterfaceProjectTokenComplete).toBeCalledTimes(1);
    expect(loader.instance.getValidatedInterfaceProjectToken).toHaveBeenNthCalledWith(1, 0);
    expect(loader.instance.queryFilter).toBeCalledTimes(0);

    expect((session as any).startTransaction).toBeCalledTimes(1);
    expect((session as any).commitTransaction).toBeCalledTimes(1);
  });

  test("Should use events to update existing DelegableToLT from db", async () => {
    // initialization
    const provider = new ethers.providers.JsonRpcProvider();
    const directoryLoader = new Directory(undefined as unknown as EventListener, CHAIN_ID, provider, ADDRESS);
    const ctLoader = new ChargedToken(CHAIN_ID, provider, ADDRESS, directoryLoader);
    const loader = new DelegableToLT(CHAIN_ID, provider, ADDRESS, directoryLoader, ctLoader);
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
      name: NAME,
      symbol: SYMBOL,
      decimals: "18",
      totalSupply: "1",
      validatedInterfaceProjectToken: ["0xADDR"],
      isListOfInterfaceProjectTokenComplete: false,
    };

    const graphqlModel = {
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

    expect(loader.instance.owner).toBeCalledTimes(0);
    expect(loader.instance.name).toBeCalledTimes(0);
    expect(loader.instance.symbol).toBeCalledTimes(0);
    expect(loader.instance.decimals).toBeCalledTimes(0);
    expect(loader.instance.totalSupply).toBeCalledTimes(0);
    expect(loader.instance.countValidatedInterfaceProjectToken).toBeCalledTimes(0);
    expect(loader.instance.isListOfInterfaceProjectTokenComplete).toBeCalledTimes(0);
    expect(loader.instance.getValidatedInterfaceProjectToken).toBeCalledTimes(0);
    expect(loader.instance.queryFilter).toBeCalledTimes(1);

    expect(loader.lastState).toEqual(graphqlModel);

    expect((session as any).startTransaction).toBeCalledTimes(1);
    expect((session as any).commitTransaction).toBeCalledTimes(1);
  });
});
