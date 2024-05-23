import { ethers } from "ethers";
import { ClientSession } from "mongodb";
import { EventListener } from "../../blockchain/EventListener";
import type { AbstractDbRepository } from "../../core/AbstractDbRepository";
import type { AbstractHandler } from "../../core/AbstractHandler";
import { MockDbRepository } from "../../core/__mocks__/MockDbRepository";

jest.mock("../../config");
jest.mock("../functions");

describe("EventListener", () => {
  let db: jest.Mocked<AbstractDbRepository>;
  let provider: jest.Mocked<ethers.providers.JsonRpcProvider>;

  beforeEach(() => {
    db = new MockDbRepository() as jest.Mocked<AbstractDbRepository>;
    provider = new ethers.providers.JsonRpcProvider() as jest.Mocked<ethers.providers.JsonRpcProvider>;
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

  it("logs should be handled in transaction", async () => {
    const log = sampleLog();
    const decodedArgs = new Map([["a", "b"]]);

    const mockAbstractHandler = {
      dataType: "ChargedToken",
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

    const mockSession = new ClientSession();
    db.startSession.mockResolvedValue(mockSession);

    const listener = new EventListener(db, provider);

    await listener.handleEvents([
      {
        eventName: "SampleEvent",
        log,
        dataType: "Directory",
        loader: mockAbstractHandler as unknown as AbstractHandler<any>,
        iface: mockInterface as unknown as ethers.utils.Interface,
      },
    ]);

    expect(db.startSession).toBeCalledTimes(1);
    expect(mockSession.startTransaction).toBeCalledTimes(1);

    expect(db.saveEvent).toBeCalledWith({
      status: "QUEUED",
      chainId: mockAbstractHandler.chainId,
      address: log.address,
      contract: "ChargedToken",
      blockNumber: log.blockNumber,
      blockDate: new Date("1970-01-01T00:00:00.000Z"),
      txHash: "0xtx_hash",
      txIndex: log.transactionIndex,
      logIndex: log.logIndex,
      name: "SampleEvent",
      args: ["b"],
      topics: [],
    });

    expect(mockAbstractHandler.onEvent).toBeCalledWith(mockSession, "SampleEvent", ["b"], log.blockNumber, log);

    expect(db.updateEventStatus).toBeCalledWith(
      {
        chainId: mockAbstractHandler.chainId,
        address: log.address,
        blockNumber: log.blockNumber,
        txIndex: log.transactionIndex,
        logIndex: log.logIndex,
      },
      "SUCCESS",
    );

    expect(mockSession.commitTransaction).toBeCalledTimes(1);
    expect(mockSession.endSession).toBeCalledTimes(1);
  });

  it("should catch event handler call failure", async () => {
    const log = sampleLog();
    const decodedArgs = new Map([["a", "b"]]);

    const mockAbstractHandler = {
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
    db.startSession.mockResolvedValue(mockSession);

    const listener = new EventListener(db, provider);

    const loggerErrorMock = jest.spyOn(listener.log, "error");

    await listener.handleEvents([
      {
        eventName: "SampleEvent",
        log,
        dataType: "Directory",
        loader: mockAbstractHandler as unknown as AbstractHandler<any>,
        iface: mockInterface as unknown as ethers.utils.Interface,
      },
    ]);

    expect(db.startSession).toBeCalledTimes(1);
    expect(mockSession.startTransaction).toBeCalledTimes(1);

    expect(mockAbstractHandler.onEvent).toHaveBeenNthCalledWith(
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
    expect(db.updateEventStatus).toHaveBeenCalledWith(
      {
        chainId: mockAbstractHandler.chainId,
        address: log.address,
        blockNumber: log.blockNumber,
        txIndex: log.transactionIndex,
        logIndex: log.logIndex,
      },
      "FAILURE",
    );
    expect(mockSession.endSession).toBeCalledTimes(1);
  });
});
