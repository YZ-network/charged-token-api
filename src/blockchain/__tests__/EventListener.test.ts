import { ethers } from "ethers";
import { ClientSession } from "mongodb";
import mongoose from "mongoose";
import { EventListener } from "../../blockchain/EventListener";
import { EventHandlerStatus } from "../../globals";
import { AbstractDbRepository, type AbstractLoader } from "../../loaders";
import { MockDbRepository } from "../../loaders/__mocks__/MockDbRepository";

jest.mock("../../globals/config");
jest.mock("../../models");

describe("EventListener", () => {
  let db: jest.Mocked<AbstractDbRepository>;
  let provider: jest.Mocked<ethers.providers.JsonRpcProvider>;

  beforeEach(() => {
    db = new MockDbRepository() as jest.Mocked<AbstractDbRepository>;
    provider = new ethers.providers.JsonRpcProvider() as jest.Mocked<ethers.providers.JsonRpcProvider>;
  });

  it("should start looking for event queue to execute and dispose on destroy", () => {
    const listener = new EventListener(db, provider);

    expect(listener.timer).toBeDefined();
    expect(listener.executingEventHandlers).toBe(false);
    expect(listener.queue.length).toBe(0);

    listener.destroy();
  });

  function sampleLog() {
    return {
      blockNumber: 15,
      blockHash: "0xblock_hash",
      transactionIndex: 1,
      removed: false,
      address: "0xaddr",
      data: "0x0000000000000000000",
      topics: [],
      transactionHash: "0xtx_hash",
      logIndex: 2,
    };
  }

  it("should queue and track log", async () => {
    const log = sampleLog();
    const decodedArgs = new Map([["a", "b"]]);

    const mockAbstractLoader = {
      chainId: 1337,
      address: "0xaddr",
    };

    const mockInterface = {
      parseLog: jest.fn(() => ({ args: decodedArgs })),
    };

    provider.getBlock.mockResolvedValueOnce({
      timestamp: 0,
    } as unknown as ethers.providers.Block);

    db.existsEvent.mockResolvedValueOnce(false);

    const listener = new EventListener(db, provider, false);
    expect(listener.queue.length).toBe(0);

    await listener.queueLog(
      "SampleEvent",
      log,
      mockAbstractLoader as unknown as AbstractLoader<any>,
      mockInterface as unknown as ethers.utils.Interface,
    );

    expect(listener.queue.length).toBe(1);
    expect(db.existsEvent).toHaveBeenNthCalledWith(
      1,
      mockAbstractLoader.chainId,
      mockAbstractLoader.address,
      log.blockNumber,
      log.transactionIndex,
      log.logIndex,
    );
    expect(mockInterface.parseLog).toHaveBeenNthCalledWith(1, log);
    expect(db.saveEvent).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        status: EventHandlerStatus.QUEUED,
        chainId: mockAbstractLoader.chainId,
        address: mockAbstractLoader.address,
        blockNumber: log.blockNumber,
        txHash: log.transactionHash,
        txIndex: log.transactionIndex,
        logIndex: log.logIndex,
        name: "SampleEvent",
        topics: log.topics,
        args: ["b"],
      }),
    );
    expect(listener.eventsAdded).toBe(true);

    listener.destroy();
  });

  it("should fail queuing twice an existing event", async () => {
    const log = sampleLog();

    const mockAbstractLoader = {
      chainId: 1337,
      address: "0xaddr",
    };

    const mockInterface = {
      parseLog: jest.fn(() => {
        return { args: new Map() };
      }),
    };

    db.existsEvent.mockResolvedValueOnce(true);

    const listener = new EventListener(db, provider, false);

    await listener.queueLog(
      "SampleEvent",
      log,
      mockAbstractLoader as unknown as AbstractLoader<any>,
      mockInterface as unknown as ethers.utils.Interface,
    );

    expect(listener.queue.length).toBe(0);

    listener.destroy();
  });

  async function waitForEventsLoopToComplete(listener: EventListener) {
    let timeout: NodeJS.Timeout | undefined;

    const promise = new Promise((resolve, reject) => {
      const interval = setInterval(() => {
        if (listener.queue.length === 0 && !listener.running) {
          clearInterval(interval);
          clearTimeout(timeout);
          resolve(undefined);
        }
      }, 1);

      timeout = setTimeout(() => {
        clearInterval(interval);
        reject(new Error("timeout reached ! killing timer"));
      }, 1500);
    });

    await promise;
  }

  it("pending logs should be executed periodically", async () => {
    const log = sampleLog();
    const decodedArgs = new Map([["a", "b"]]);

    const mockAbstractLoader = {
      chainId: 1337,
      address: "0xaddr",
      onEvent: jest.fn(),
    };

    const mockInterface = {
      parseLog: jest.fn(() => {
        return { args: decodedArgs };
      }),
    };

    provider.getBlock.mockResolvedValueOnce({
      timestamp: 0,
    } as unknown as ethers.providers.Block);

    db.existsEvent.mockResolvedValue(true).mockResolvedValueOnce(false);

    const mockSession = new ClientSession();
    (mongoose as any).startSession.mockReturnValue(mockSession);

    const listener = new EventListener(db, provider);

    await listener.queueLog(
      "SampleEvent",
      log,
      mockAbstractLoader as unknown as AbstractLoader<any>,
      mockInterface as unknown as ethers.utils.Interface,
    );
    await waitForEventsLoopToComplete(listener);

    expect(mongoose.startSession).toBeCalledTimes(1);
    expect(mockSession.startTransaction).toBeCalledTimes(1);

    expect(mockAbstractLoader.onEvent).toHaveBeenNthCalledWith(
      1,
      mockSession,
      "SampleEvent",
      ["b"],
      log.blockNumber,
      log,
    );
    expect(db.updateEventStatus).toHaveBeenNthCalledWith(
      1,
      {
        chainId: mockAbstractLoader.chainId,
        address: log.address,
        blockNumber: log.blockNumber,
        txIndex: log.transactionIndex,
        logIndex: log.logIndex,
      },
      EventHandlerStatus.SUCCESS,
    );

    expect(mockSession.commitTransaction).toBeCalledTimes(1);
    expect(mockSession.endSession).toBeCalledTimes(1);

    listener.destroy();
  });

  it("should catch event handler call failure", async () => {
    const log = sampleLog();
    const decodedArgs = new Map([["a", "b"]]);

    const mockAbstractLoader = {
      chainId: 1337,
      address: "0xaddr",
      onEvent: jest.fn(() => {
        throw new Error("event handler error");
      }),
    };

    const mockInterface = {
      parseLog: jest.fn(() => {
        return { args: decodedArgs };
      }),
    };

    provider.getBlock.mockResolvedValueOnce({
      timestamp: 0,
    } as unknown as ethers.providers.Block);

    const mockSession = new ClientSession();
    (mongoose as any).startSession.mockResolvedValue(mockSession);

    db.existsEvent.mockResolvedValue(true).mockResolvedValueOnce(false);

    const listener = new EventListener(db, provider, false);

    const loggerErrorMock = jest.spyOn(listener.log, "error");

    await listener.queueLog(
      "SampleEvent",
      log,
      mockAbstractLoader as unknown as AbstractLoader<any>,
      mockInterface as unknown as ethers.utils.Interface,
    );
    await listener.executePendingLogs();

    expect(listener.running).toBe(false);
    expect(listener.queue.length).toBe(1);

    expect(mongoose.startSession).toBeCalledTimes(1);
    expect(mockSession.startTransaction).toBeCalledTimes(1);

    expect(mockAbstractLoader.onEvent).toHaveBeenNthCalledWith(
      1,
      mockSession,
      "SampleEvent",
      ["b"],
      log.blockNumber,
      log,
    );
    expect(loggerErrorMock).toBeCalledTimes(1);

    expect(mockSession.abortTransaction).toBeCalledTimes(1);
    expect(mockSession.commitTransaction).toBeCalledTimes(0);
    expect(mockSession.endSession).toBeCalledTimes(1);

    listener.destroy();
  });
});
