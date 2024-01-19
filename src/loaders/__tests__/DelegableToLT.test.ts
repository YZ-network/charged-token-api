import { BigNumber, ethers } from "ethers";
import { ClientSession } from "mongodb";
import { FlattenMaps } from "mongoose";
import { IDelegableToLT } from "../../models";
import { EMPTY_ADDRESS } from "../../types";
import { ChargedToken } from "../ChargedToken";
import { DelegableToLT } from "../DelegableToLT";
import { Directory } from "../Directory";
import { EventListener } from "../EventListener";

jest.mock("../../globals/config");
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
    expect(loader.lastUpdateBlock).toBe(0);
    expect(loader.lastState).toEqual(undefined);

    // mocking ethers
    const BLOCK_NUMBER = 15;

    (provider as any).getBlockNumber.mockResolvedValueOnce(BLOCK_NUMBER);

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
    (loader.model as any).toModel.mockReturnValueOnce(modelInstanceMock);
    (loader.model as any).exists.mockResolvedValueOnce(null);
    (loader.model as any).toGraphQL.mockReturnValueOnce(graphqlModel);

    // mocking contract instance
    loader.instance.owner.mockResolvedValueOnce(OWNER);
    loader.instance.name.mockResolvedValueOnce(NAME);
    loader.instance.symbol.mockResolvedValueOnce(SYMBOL);
    loader.instance.decimals.mockResolvedValueOnce(BigNumber.from(18));
    loader.instance.totalSupply.mockResolvedValueOnce(BigNumber.from(1));
    loader.instance.countValidatedInterfaceProjectToken.mockResolvedValueOnce(BigNumber.from(1));
    loader.instance.getValidatedInterfaceProjectToken.mockResolvedValueOnce("0xADDR");
    loader.instance.isListOfInterfaceProjectTokenComplete.mockResolvedValueOnce(false);

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

    (provider as any).getBlockNumber.mockResolvedValueOnce(BLOCK_NUMBER);

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

  test("should load user balance from contract", async () => {
    const provider = new ethers.providers.JsonRpcProvider();
    const eventsListener = new EventListener();
    const loader = new DelegableToLT(CHAIN_ID, provider, ADDRESS, { eventsListener } as any, undefined as any);

    loader.instance.balanceOf.mockResolvedValueOnce(BigNumber.from(10));

    const result = await loader.loadUserBalance("0xUSER");

    expect(result).toBe("10");
    expect(loader.instance.balanceOf).toHaveBeenCalledWith("0xUSER");
  });

  // Event Handlers
  test("AddedInterfaceProjectToken", async () => {
    const provider = new ethers.providers.JsonRpcProvider();
    const eventsListener = new EventListener();
    const loader = new DelegableToLT(CHAIN_ID, provider, ADDRESS, { eventsListener } as any, undefined as any);
    const session = new ClientSession();

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
    const provider = new ethers.providers.JsonRpcProvider();
    const eventsListener = new EventListener();
    const loader = new DelegableToLT(CHAIN_ID, provider, ADDRESS, { eventsListener } as any, undefined as any);
    const session = new ClientSession();

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
    const provider = new ethers.providers.JsonRpcProvider();
    const eventsListener = new EventListener();
    const loader = new DelegableToLT(CHAIN_ID, provider, ADDRESS, { eventsListener } as any, undefined as any);
    const session = new ClientSession();

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
    const provider = new ethers.providers.JsonRpcProvider();
    const eventsListener = new EventListener();
    const loader = new DelegableToLT(CHAIN_ID, provider, ADDRESS, { eventsListener } as any, undefined as any);
    const session = new ClientSession();

    await loader.onTransferEvent(session, ["0xFROM", "0xTO", "0"], 15, "Transfer");
  });

  test("Transfer: p2p transfers should update both balances", async () => {
    const provider = new ethers.providers.JsonRpcProvider();
    const eventsListener = new EventListener();
    const loader = new DelegableToLT(
      CHAIN_ID,
      provider,
      ADDRESS,
      { eventsListener } as any,
      { address: ADDRESS } as any,
    );
    const session = new ClientSession();

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
    const provider = new ethers.providers.JsonRpcProvider();
    const eventsListener = new EventListener();
    const loader = new DelegableToLT(
      CHAIN_ID,
      provider,
      ADDRESS,
      { eventsListener } as any,
      { address: ADDRESS } as any,
    );
    const session = new ClientSession();

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
    const provider = new ethers.providers.JsonRpcProvider();
    const eventsListener = new EventListener();
    const loader = new DelegableToLT(
      CHAIN_ID,
      provider,
      ADDRESS,
      { eventsListener } as any,
      { address: ADDRESS } as any,
    );
    const session = new ClientSession();

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
    const provider = new ethers.providers.JsonRpcProvider();
    const eventsListener = new EventListener();
    const loader = new DelegableToLT(CHAIN_ID, provider, ADDRESS, { eventsListener } as any, undefined as any);
    const session = new ClientSession();

    // does nothing
    await loader.onApprovalEvent(session, [], 15, "Approval");
  });

  test("AddedAllTimeValidatedInterfaceProjectToken", async () => {
    const provider = new ethers.providers.JsonRpcProvider();
    const eventsListener = new EventListener();
    const loader = new DelegableToLT(CHAIN_ID, provider, ADDRESS, { eventsListener } as any, undefined as any);
    const session = new ClientSession();

    // does nothing
    await loader.onAddedAllTimeValidatedInterfaceProjectTokenEvent(
      session,
      [],
      15,
      "AddedAllTimeValidatedInterfaceProjectToken",
    );
  });
});
