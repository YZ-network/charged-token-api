import { ClientSession } from "mongodb";
import mongoose from "mongoose";
import { EventHandlerStatus } from "../../enums";
import { EventModel } from "../../models";
import { type AbstractLoader } from "../AbstractLoader";
import { EventListener } from "../EventListener";

jest.mock("../../config");
jest.mock("../../models");

describe("EventListener", () => {
  afterEach(() => {
    (EventModel.exists as jest.Mock).mockReset();
  });

  test("should start looking for event queue to execute and dispose on destroy", () => {
    const listener = new EventListener();

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

  test("should queue and track log", async () => {
    const log = sampleLog();
    const decodedArgs = new Map([["a", "b"]]);

    const mockAbstractLoader = {
      chainId: 1337,
      address: "0xaddr",
      iface: {
        parseLog: jest.fn(() => {
          return { args: decodedArgs };
        }),
      },
      provider: {
        getBlock: jest.fn(() => {
          return {
            timestamp: 0,
          };
        }),
      },
    };
    (EventModel as any).exists.mockResolvedValueOnce(null);

    const listener = new EventListener(false);
    expect(listener.queue.length).toBe(0);

    await listener.queueLog("SampleEvent", log, mockAbstractLoader as unknown as AbstractLoader<any>);

    expect(listener.queue.length).toBe(1);
    expect(EventModel.exists).toHaveBeenNthCalledWith(1, {
      chainId: mockAbstractLoader.chainId,
      address: mockAbstractLoader.address,
      blockNumber: log.blockNumber,
      txIndex: log.transactionIndex,
      logIndex: log.logIndex,
    });
    expect(mockAbstractLoader.iface.parseLog).toHaveBeenNthCalledWith(1, log);
    expect(EventModel.create).toHaveBeenNthCalledWith(
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

  test("should fail queuing twice an existing event", async () => {
    const log = sampleLog();

    const mockAbstractLoader = {
      chainId: 1337,
      address: "0xaddr",
    };
    (EventModel as any).exists.mockResolvedValueOnce("not_null");

    const listener = new EventListener(false);

    await expect(
      listener.queueLog("SampleEvent", log, mockAbstractLoader as unknown as AbstractLoader<any>),
    ).rejects.toThrowError();

    listener.destroy();

    (EventModel as any).exists.mockReset();
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

  test("pending logs should be executed periodically", async () => {
    const log = sampleLog();
    const decodedArgs = new Map([["a", "b"]]);

    const mockAbstractLoader = {
      chainId: 1337,
      address: "0xaddr",
      iface: {
        parseLog: jest.fn(() => {
          return { args: decodedArgs };
        }),
      },
      provider: {
        getBlock: jest.fn(() => {
          return {
            timestamp: 0,
          };
        }),
      },
      onEvent: jest.fn(),
    };
    (EventModel as any).exists.mockResolvedValue(true).mockResolvedValueOnce(null);

    const mockSession = new ClientSession();
    (mongoose as any).startSession.mockReturnValue(mockSession);

    const listener = new EventListener();

    await listener.queueLog("SampleEvent", log, mockAbstractLoader as unknown as AbstractLoader<any>);
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
    expect(EventModel.updateOne).toHaveBeenNthCalledWith(
      1,
      {
        chainId: mockAbstractLoader.chainId,
        address: log.address,
        blockNumber: log.blockNumber,
        txIndex: log.transactionIndex,
        logIndex: log.logIndex,
      },
      { status: EventHandlerStatus.SUCCESS },
      { session: mockSession },
    );

    expect(mockSession.commitTransaction).toBeCalledTimes(1);
    expect(mockSession.endSession).toBeCalledTimes(1);

    listener.destroy();
  });

  test("should catch event handler call failure", async () => {
    const log = sampleLog();
    const decodedArgs = new Map([["a", "b"]]);

    const mockAbstractLoader = {
      chainId: 1337,
      address: "0xaddr",
      iface: {
        parseLog: jest.fn(() => {
          return { args: decodedArgs };
        }),
      },
      provider: {
        getBlock: jest.fn(() => {
          return {
            timestamp: 0,
          };
        }),
      },
      onEvent: jest.fn(() => {
        throw new Error("event handler error");
      }),
    };

    const mockSession = new ClientSession();
    (mongoose as any).startSession.mockResolvedValue(mockSession);

    (EventModel as any).exists.mockResolvedValue(true).mockResolvedValueOnce(null);

    const listener = new EventListener(false);

    const loggerErrorMock = jest.spyOn(listener.log, "error");

    await listener.queueLog("SampleEvent", log, mockAbstractLoader as unknown as AbstractLoader<any>);
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
