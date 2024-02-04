import { ethers } from "ethers";
import { ClientSession } from "mongodb";
import mongoose from "mongoose";
import { pubSub } from "../../graphql";
import { DataType } from "../../types";
import { AbstractDbRepository } from "../AbstractDbRepository";
import { ChargedToken } from "../ChargedToken";
import { Directory } from "../Directory";
import { EventListener } from "../EventListener";
import { MockDbRepository } from "../__mocks__/MockDbRepository";

jest.mock("../../globals/config");
jest.mock("../../topics");
jest.mock("../../graphql");
jest.mock("../../models");
jest.mock("../EventListener");

describe("AbstractLoader: common loaders features", () => {
  const CHAIN_ID = 1337;
  const ADDRESS = "0xADDRESS";

  let provider: ethers.providers.JsonRpcProvider;
  let eventsListener: EventListener;
  let db: jest.Mocked<AbstractDbRepository>;
  let directoryLoader: Directory;
  let ctLoader: ChargedToken;
  let session: ClientSession;

  beforeEach(() => {
    provider = new ethers.providers.JsonRpcProvider();
    db = new MockDbRepository() as jest.Mocked<AbstractDbRepository>;
    eventsListener = new EventListener(db, false);
    directoryLoader = new Directory(eventsListener, CHAIN_ID, provider, ADDRESS, db);
    ctLoader = new ChargedToken(CHAIN_ID, provider, ADDRESS, directoryLoader, db);
    session = new ClientSession();
  });

  it("should load balances by project token address", async () => {
    await directoryLoader.getBalancesByProjectToken(session, "0xPT", "0xUSER");

    expect(db.getBalancesByProjectToken).toBeCalledWith(CHAIN_ID, "0xPT", "0xUSER");
  });

  it("should detect balances updates that trigger negative amounts", async () => {
    const ERROR_MSG = "Invalid update detected : negative amounts in user balance";

    const blockNumber = 15;

    await expect(
      directoryLoader.updateBalanceAndNotify(
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
      directoryLoader.updateBalanceAndNotify(
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
      directoryLoader.updateBalanceAndNotify(
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
      directoryLoader.updateBalanceAndNotify(
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
      directoryLoader.updateBalanceAndNotify(
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
      directoryLoader.updateBalanceAndNotify(
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
    const blockNumber = 20;

    const jsonBalance = { balance: "15" } as any;
    const balanceUpdate = { ...jsonBalance } as any;

    const getBalance = jest.spyOn(directoryLoader, "getBalance").mockResolvedValue(balanceUpdate);

    await directoryLoader.updateBalanceAndNotify(
      session,
      ADDRESS,
      "0xUSER",
      balanceUpdate,
      blockNumber,
      undefined,
      "SampleEvent",
    );

    expect(db.updateBalance).toBeCalledWith({
      ...balanceUpdate,
      chainId: CHAIN_ID,
      address: ADDRESS,
      user: "0xUSER",
      lastUpdateBlock: blockNumber,
    });
    expect(getBalance).toBeCalledWith(session, ADDRESS, "0xUSER");
    expect(pubSub.publish).toBeCalledWith("UserBalance.1337.0xUSER", [jsonBalance]);
  });

  it("should propagate changes to the PT balance and notify", async () => {
    const blockNumber = 20;

    const jsonBalance = { balancePT: "15" } as any;
    const balanceUpdate = { ...jsonBalance } as any;

    const getBalancesByPT = jest.spyOn(directoryLoader, "getBalancesByProjectToken").mockResolvedValue([balanceUpdate]);

    await directoryLoader.updateBalanceAndNotify(
      session,
      ADDRESS,
      "0xUSER",
      balanceUpdate,
      blockNumber,
      "0xPT",
      "SampleEvent",
    );

    expect(db.updateBalance).toBeCalledWith({
      ...balanceUpdate,
      chainId: CHAIN_ID,
      address: ADDRESS,
      user: "0xUSER",
      lastUpdateBlock: blockNumber,
    });
    expect(db.updateOtherBalancesByProjectToken).toBeCalledWith(ADDRESS, {
      ...jsonBalance,
      chainId: CHAIN_ID,
      user: "0xUSER",
      ptAddress: "0xPT",
      lastUpdateBlock: blockNumber,
    });
    expect(getBalancesByPT).toBeCalledWith(session, "0xPT", "0xUSER");
    expect(pubSub.publish).toBeCalledWith("UserBalance.1337.0xUSER", [jsonBalance]);
  });

  it("should add loaded past events to the queue and execute them", async () => {
    const { EventListener: RealEventListener } = jest.requireActual("../EventListener");
    const eventsListener = new RealEventListener(db, false);
    const loader = new Directory(eventsListener, CHAIN_ID, provider, ADDRESS, db);

    const blockNumber = 20;

    const loadedModel = {
      address: ADDRESS,
      initBlock: 10,
      lastUpdateBlock: 15,
      directory: [],
    };
    db.get.mockResolvedValue(loadedModel);

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
    (loader.instance as any).queryFilter.mockResolvedValue(allEvents);

    (provider as any).getBlock.mockImplementation(async (blockNumber: number) => {
      return { timestamp: blockNumber * 86400 };
    });

    (loader.iface as any).parseLog.mockImplementation((value: any) => value);
    db.existsEvent
      .mockResolvedValue(false)
      // first 2 events are passed
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true);

    await loader.init(session, blockNumber);

    expect(db.get).toBeCalledWith(DataType.Directory, CHAIN_ID, ADDRESS);
    expect(loader.instance.queryFilter).toBeCalledWith({ address: ADDRESS }, loadedModel.lastUpdateBlock);

    expect(db.existsEvent).toBeCalledTimes(allEvents.length + missedEvents.length);

    for (const event of allEvents) {
      expect(db.existsEvent).toBeCalledWith(
        CHAIN_ID,
        ADDRESS,
        event.blockNumber,
        event.transactionIndex,
        event.logIndex,
      );
    }

    expect(db.saveEvent).toBeCalledTimes(missedEvents.length);
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

    db.existsEvent.mockClear();
    db.existsEvent.mockResolvedValue(true);

    jest.spyOn(loader, "onEvent").mockResolvedValue(undefined);

    // first execution processes all events for block 16
    await eventsListener.executePendingLogs();

    expect(mongoose.startSession).toBeCalledTimes(1);
    expect(db.existsEvent).toBeCalledTimes(4);
    expect(loader.onEvent).toBeCalledTimes(3);
    expect(eventsListener.queue.length).toBe(2);
    expect(eventsSession.startTransaction).toBeCalledTimes(3);
    expect(eventsSession.commitTransaction).toBeCalledTimes(3);
    expect(eventsSession.abortTransaction).toBeCalledTimes(0);
    expect(eventsSession.endSession).toBeCalledTimes(1);
    expect(db.updateEventStatus).toBeCalledTimes(3);

    (mongoose as any).startSession.mockClear();
    db.existsEvent.mockClear();
    (loader as any).onEvent.mockClear();
    (eventsSession as any).startTransaction.mockClear();
    (eventsSession as any).commitTransaction.mockClear();
    (eventsSession as any).abortTransaction.mockClear();
    (eventsSession as any).endSession.mockClear();
    db.updateEventStatus.mockClear();

    // first execution processes all events for block 17
    await eventsListener.executePendingLogs();

    expect(mongoose.startSession).toBeCalledTimes(1);
    expect(db.existsEvent).toBeCalledTimes(2);
    expect(loader.onEvent).toBeCalledTimes(2);
    expect(eventsListener.queue.length).toBe(0);
    expect(eventsSession.startTransaction).toBeCalledTimes(2);
    expect(eventsSession.commitTransaction).toBeCalledTimes(2);
    expect(eventsSession.abortTransaction).toBeCalledTimes(0);
    expect(eventsSession.endSession).toBeCalledTimes(1);
    expect(db.updateEventStatus).toBeCalledTimes(2);
  });
});
