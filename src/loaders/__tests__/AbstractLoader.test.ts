import { ethers } from "ethers";
import { ClientSession } from "mongodb";
import mongoose from "mongoose";
import { pubSub } from "../../graphql";
import { ChargedTokenModel, DirectoryModel, EventModel, UserBalanceModel } from "../../models";
import { ChargedToken } from "../ChargedToken";
import { Directory } from "../Directory";
import { EventListener } from "../EventListener";

jest.mock("../../globals/config");
jest.mock("../../topics");
jest.mock("../../graphql");
jest.mock("../../models");
jest.mock("../EventListener");

describe("AbstractLoader: common loaders features", () => {
  const CHAIN_ID = 1337;
  const ADDRESS = "0xADDRESS";

  /*
  afterEach(() => {
    jest.clearAllMocks();
    (EventModel as any).exists.mockReset();
  });
  */

  it("should call model toModel method, depending on the contract implementation", () => {
    const provider = new ethers.providers.JsonRpcProvider();
    const eventsListener = new EventListener();
    const directoryLoader = new Directory(eventsListener, CHAIN_ID, provider, ADDRESS);
    const ctLoader = new ChargedToken(CHAIN_ID, provider, ADDRESS, directoryLoader);

    expect(DirectoryModel.toModel).not.toBeCalled();
    expect(ChargedTokenModel.toModel).not.toBeCalled();

    (DirectoryModel as any).toModel.mockClear();
    (ChargedTokenModel as any).toModel.mockClear();
    directoryLoader.toModel({} as any);

    expect(DirectoryModel.toModel).toBeCalled();
    expect(ChargedTokenModel.toModel).not.toBeCalled();

    (DirectoryModel as any).toModel.mockClear();
    (ChargedTokenModel as any).toModel.mockClear();
    ctLoader.toModel({} as any);

    expect(DirectoryModel.toModel).not.toBeCalled();
    expect(ChargedTokenModel.toModel).toBeCalled();
  });

  it("should load balances by project token address", async () => {
    const provider = new ethers.providers.JsonRpcProvider();
    const eventsListener = new EventListener();
    const loader = new Directory(eventsListener, CHAIN_ID, provider, ADDRESS);
    const session = new ClientSession();

    await loader.getBalancesByProjectToken(session, "0xPT", "0xUSER");

    expect(UserBalanceModel.find).toBeCalledWith({ ptAddress: "0xPT", user: "0xUSER" }, undefined, { session });
  });

  it("should detect balances updates that trigger negative amounts", async () => {
    const provider = new ethers.providers.JsonRpcProvider();
    const eventsListener = new EventListener();
    const loader = new Directory(eventsListener, CHAIN_ID, provider, ADDRESS);
    const session = new ClientSession();

    const ERROR_MSG = "Invalid update detected : negative amounts in user balance";

    const blockNumber = 15;

    await expect(
      loader.updateBalanceAndNotify(
        session,
        ADDRESS,
        "0xUSER",
        { balance: "-0" },
        blockNumber,
        undefined,
        "SampleEvent",
      ),
    ).rejects.toThrowError(ERROR_MSG);

    await expect(
      loader.updateBalanceAndNotify(
        session,
        ADDRESS,
        "0xUSER",
        { balancePT: "-0" },
        blockNumber,
        undefined,
        "SampleEvent",
      ),
    ).rejects.toThrowError(ERROR_MSG);

    await expect(
      loader.updateBalanceAndNotify(
        session,
        ADDRESS,
        "0xUSER",
        { fullyChargedBalance: "-0" },
        blockNumber,
        undefined,
        "SampleEvent",
      ),
    ).rejects.toThrowError(ERROR_MSG);

    await expect(
      loader.updateBalanceAndNotify(
        session,
        ADDRESS,
        "0xUSER",
        { partiallyChargedBalance: "-0" },
        blockNumber,
        undefined,
        "SampleEvent",
      ),
    ).rejects.toThrowError(ERROR_MSG);

    await expect(
      loader.updateBalanceAndNotify(
        session,
        ADDRESS,
        "0xUSER",
        { claimedRewardPerShare1e18: "-0" },
        blockNumber,
        undefined,
        "SampleEvent",
      ),
    ).rejects.toThrowError(ERROR_MSG);

    await expect(
      loader.updateBalanceAndNotify(
        session,
        ADDRESS,
        "0xUSER",
        { valueProjectTokenToFullRecharge: "-0" },
        blockNumber,
        undefined,
        "SampleEvent",
      ),
    ).rejects.toThrowError(ERROR_MSG);
  });

  it("should update user balances and notify", async () => {
    const provider = new ethers.providers.JsonRpcProvider();
    const eventsListener = new EventListener();
    const loader = new Directory(eventsListener, CHAIN_ID, provider, ADDRESS);
    const session = new ClientSession();

    const blockNumber = 20;

    const jsonBalance = { balance: "15" } as any;
    const balanceUpdate = { ...jsonBalance, toJSON: jest.fn(() => jsonBalance) } as any;

    const getBalance = jest.spyOn(loader, "getBalance").mockResolvedValue(balanceUpdate);
    (UserBalanceModel as any).toGraphQL.mockReturnValue(jsonBalance);

    await loader.updateBalanceAndNotify(
      session,
      ADDRESS,
      "0xUSER",
      balanceUpdate,
      blockNumber,
      undefined,
      "SampleEvent",
    );

    expect(UserBalanceModel.updateOne).toBeCalledWith(
      { address: ADDRESS, user: "0xUSER" },
      { ...balanceUpdate, lastUpdateBlock: blockNumber },
      { session },
    );
    expect(getBalance).toBeCalledWith(session, ADDRESS, "0xUSER");
    expect(UserBalanceModel.toGraphQL).toBeCalledWith(balanceUpdate);
    expect(pubSub.publish).toBeCalledWith("UserBalance.1337.0xUSER", [jsonBalance]);
  });

  it("should propagate changes to the PT balance and notify", async () => {
    const provider = new ethers.providers.JsonRpcProvider();
    const eventsListener = new EventListener();
    const loader = new Directory(eventsListener, CHAIN_ID, provider, ADDRESS);
    const session = new ClientSession();

    const blockNumber = 20;

    const jsonBalance = { balancePT: "15" } as any;
    const balanceUpdate = { ...jsonBalance, toJSON: jest.fn(() => jsonBalance) } as any;

    const getBalancesByPT = jest.spyOn(loader, "getBalancesByProjectToken").mockResolvedValue([balanceUpdate]);
    (UserBalanceModel as any).toGraphQL.mockReturnValue(jsonBalance);

    await loader.updateBalanceAndNotify(session, ADDRESS, "0xUSER", balanceUpdate, blockNumber, "0xPT", "SampleEvent");

    expect(UserBalanceModel.updateOne).toBeCalledWith(
      { address: ADDRESS, user: "0xUSER" },
      { ...balanceUpdate, lastUpdateBlock: blockNumber },
      { session },
    );
    expect(UserBalanceModel.updateMany).toBeCalledWith(
      { user: "0xUSER", ptAddress: "0xPT", address: { $ne: ADDRESS } },
      { ...jsonBalance, lastUpdateBlock: blockNumber },
      { session },
    );
    expect(getBalancesByPT).toBeCalledWith(session, "0xPT", "0xUSER");
    expect(UserBalanceModel.toGraphQL).toBeCalledWith(balanceUpdate);
    expect(pubSub.publish).toBeCalledWith("UserBalance.1337.0xUSER", [jsonBalance]);
  });

  it("should add loaded past events to the queue and execute them", async () => {
    const { EventListener: RealEventListener } = jest.requireActual("../EventListener");

    const provider = new ethers.providers.JsonRpcProvider();
    const eventsListener = new RealEventListener(false);
    const loader = new Directory(eventsListener, CHAIN_ID, provider, ADDRESS);
    const session = new ClientSession();

    const blockNumber = 20;

    const loadedModel = {
      address: ADDRESS,
      initBlock: 10,
      lastUpdateBlock: 15,
      directory: [],
    };
    (DirectoryModel as any).findOne.mockResolvedValueOnce(loadedModel);
    (DirectoryModel as any).toGraphQL.mockImplementation((value: any) => value);

    const passedEvents = [
      {
        event: "EventName1",
        blockNumber: 15,
        transactionIndex: 1,
        logIndex: 1,
        args: [],
      },
      {
        event: "EventName2",
        blockNumber: 15,
        transactionIndex: 1,
        logIndex: 2,
        args: [],
      },
    ];
    const missedEvents = [
      {
        event: "EventName5",
        blockNumber: 16,
        transactionIndex: 2,
        logIndex: 3,
        args: [],
      },
      {
        event: "EventName4",
        blockNumber: 16,
        transactionIndex: 1,
        logIndex: 2,
        args: [],
      },
      {
        event: "EventName7",
        blockNumber: 17,
        transactionIndex: 2,
        logIndex: 2,
        args: [],
      },
      {
        event: "EventName3",
        blockNumber: 16,
        transactionIndex: 1,
        logIndex: 1,
        args: [],
      },
      {
        event: "EventName6",
        blockNumber: 17,
        transactionIndex: 1,
        logIndex: 1,
        args: [],
      },
    ];
    const allEvents = [...passedEvents, ...missedEvents];
    (loader.instance as any).queryFilter.mockResolvedValueOnce(allEvents);

    (EventModel as any).exists.mockResolvedValue(null).mockResolvedValueOnce(true).mockResolvedValueOnce(true);
    (EventModel as any).create.mockResolvedValue(null);

    (provider as any).getBlock.mockImplementation(async (blockNumber: number) => {
      return { timestamp: blockNumber * 86400 };
    });

    (loader.iface as any).parseLog.mockImplementation((value: any) => value);

    await loader.init(session, blockNumber);

    expect(DirectoryModel.findOne).toBeCalledWith({ chainId: CHAIN_ID, address: ADDRESS }, undefined, { session });
    expect(DirectoryModel.toGraphQL).toBeCalledWith(loadedModel);
    expect(loader.instance.queryFilter).toBeCalledWith({ address: ADDRESS }, loadedModel.lastUpdateBlock);

    expect(EventModel.exists).toBeCalledTimes(missedEvents.length + allEvents.length);

    for (const event of allEvents) {
      expect(EventModel.exists).toBeCalledWith({
        chainId: CHAIN_ID,
        address: ADDRESS,
        blockNumber: event.blockNumber,
        txIndex: event.transactionIndex,
        logIndex: event.logIndex,
      });
    }

    expect(EventModel.create).toBeCalledTimes(missedEvents.length);
    expect(eventsListener.queue.length).toBe(missedEvents.length);
    expect(eventsListener.queue.map((event: any) => event.eventName)).toEqual([
      "EventName3",
      "EventName4",
      "EventName5",
      "EventName6",
      "EventName7",
    ]);
    expect(loader.iface.parseLog).toBeCalledTimes(missedEvents.length);

    const eventsSession = new ClientSession();

    (mongoose as any).startSession.mockResolvedValue(eventsSession);

    (EventModel as any).exists.mockClear();
    (EventModel as any).exists.mockResolvedValue(true);

    jest.spyOn(loader, "onEvent").mockResolvedValue(undefined);

    // first execution processes all events for block 16
    await eventsListener.executePendingLogs();

    expect(mongoose.startSession).toBeCalledTimes(1);
    expect(EventModel.exists).toBeCalledTimes(4);
    expect(loader.onEvent).toBeCalledTimes(3);
    expect(eventsListener.queue.length).toBe(2);
    expect(eventsSession.startTransaction).toBeCalledTimes(3);
    expect(eventsSession.commitTransaction).toBeCalledTimes(3);
    expect(eventsSession.abortTransaction).toBeCalledTimes(0);
    expect(eventsSession.endSession).toBeCalledTimes(1);
    expect(EventModel.updateOne).toBeCalledTimes(3);

    (mongoose as any).startSession.mockClear();
    (EventModel as any).exists.mockClear();
    (loader as any).onEvent.mockClear();
    (eventsSession as any).startTransaction.mockClear();
    (eventsSession as any).commitTransaction.mockClear();
    (eventsSession as any).abortTransaction.mockClear();
    (eventsSession as any).endSession.mockClear();
    (EventModel as any).updateOne.mockClear();

    // first execution processes all events for block 17
    await eventsListener.executePendingLogs();

    expect(mongoose.startSession).toBeCalledTimes(1);
    expect(EventModel.exists).toBeCalledTimes(2);
    expect(loader.onEvent).toBeCalledTimes(2);
    expect(eventsListener.queue.length).toBe(0);
    expect(eventsSession.startTransaction).toBeCalledTimes(2);
    expect(eventsSession.commitTransaction).toBeCalledTimes(2);
    expect(eventsSession.abortTransaction).toBeCalledTimes(0);
    expect(eventsSession.endSession).toBeCalledTimes(1);
    expect(EventModel.updateOne).toBeCalledTimes(2);
  });
});
