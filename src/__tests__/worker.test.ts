import mongoose from "mongoose";
import { ProviderStatus, WorkerStatus } from "../globals";
import { Directory } from "../loaders/Directory";
import { EventModel } from "../models";
import { subscribeToUserBalancesLoading } from "../subscriptions";
import { AutoWebSocketProvider, Metrics } from "../util";
import { ChainWorker } from "../worker";

jest.mock("../globals/config");
jest.mock("../util/AutoWebSocketProvider");
jest.mock("../loaders/EventListener");
jest.mock("../loaders/Directory");
jest.mock("../models");
jest.mock("../subscriptions");

describe("ChainWorker", () => {
  const RPC = "ws://127.0.0.1:8545";
  const DIRECTORY = "0xDIRECTORY";
  const CHAIN_ID = 1337;

  function mockProviderBase() {
    const mockHandlers: Record<string, any> = {};

    return {
      handlers: mockHandlers,
      websocket: {
        readyState: 1,
      },
      on: jest.fn((event, handler) => {
        mockHandlers[event] = handler;
      }),
      ready: new Promise((resolve) => {
        resolve({
          name: "test",
          chainId: 1337,
        });
      }),
      getBlockNumber: jest.fn(),
      removeAllListeners: jest.fn(),
      destroy: jest.fn(),
    };
  }

  async function waitForWorkerToStart(worker: ChainWorker) {
    let timeout: NodeJS.Timeout | undefined;

    const waitPromise = new Promise((resolve, reject) => {
      const interval = setInterval(() => {
        if (worker.providerStatus === ProviderStatus.CONNECTED && worker.workerStatus === WorkerStatus.STARTED) {
          clearInterval(interval);
          resolve(undefined);
        }
      }, 1);

      timeout = setTimeout(() => {
        clearInterval(interval);
        reject(new Error("Timeout reached ! killed it"));
      }, 1000);
    });

    await waitPromise;

    clearTimeout(timeout);
  }

  async function waitForWsToConnect(worker: ChainWorker) {
    let timeout: NodeJS.Timeout | undefined;

    const waitPromise = new Promise((resolve, reject) => {
      const interval = setInterval(() => {
        if (worker.wsStatus === "OPEN") {
          clearInterval(interval);
          resolve(undefined);
        }
      }, 1);

      timeout = setTimeout(() => {
        clearInterval(interval);
        reject(new Error("Timeout reached ! killed it"));
      }, 1000);
    });

    await waitPromise;

    clearTimeout(timeout);
  }

  async function waitForWorkerToStop(worker: ChainWorker) {
    let timeout: NodeJS.Timeout | undefined;

    const waitPromise = new Promise((resolve, reject) => {
      const interval = setInterval(() => {
        if (worker.providerStatus === ProviderStatus.DEAD && worker.workerStatus === WorkerStatus.DEAD) {
          clearInterval(interval);
          resolve(undefined);
        }
      }, 1);

      timeout = setTimeout(() => {
        clearInterval(interval);
        reject(new Error("Timeout reached ! killed it"));
      }, 1000);
    });

    await waitPromise;

    clearTimeout(timeout);
  }

  afterEach(() => {
    Metrics.reset();
  });

  test("should start and try connecting upon creation", async () => {
    (AutoWebSocketProvider as any).mockImplementationOnce(() => {
      const base = mockProviderBase();

      return {
        ...base,
        websocket: {
          readyState: 0,
        },
        ready: new Promise(() => {}),
      };
    });

    (EventModel as any).find.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const worker = new ChainWorker(0, RPC, DIRECTORY, CHAIN_ID);

    expect(worker.provider).toBeDefined();
    expect(worker.provider?.on).toHaveBeenNthCalledWith(1, "error", expect.anything());
    expect(worker.wsWatch).toBeDefined();
    expect(worker.worker).toBeDefined();

    expect(worker.status()).toEqual({
      index: 0,
      rpc: RPC,
      directory: DIRECTORY,
      name: undefined,
      chainId: CHAIN_ID,
      providerStatus: ProviderStatus.STARTING,
      workerStatus: WorkerStatus.WAITING,
      wsStatus: "CONNECTING",
      restartCount: 0,
    });

    clearInterval(worker.wsWatch);
  });

  test("should initialize directory upon connection", async () => {
    (AutoWebSocketProvider as any).mockReturnValueOnce(mockProviderBase());

    (EventModel as any).find.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const mockSession = {
      endSession: jest.fn(),
    };
    (mongoose as any).startSession.mockResolvedValueOnce(mockSession);

    const worker = new ChainWorker(0, RPC, DIRECTORY, CHAIN_ID);
    await waitForWorkerToStart(worker);

    expect(worker.status()).toEqual({
      index: 0,
      rpc: RPC,
      directory: DIRECTORY,
      name: "test",
      chainId: CHAIN_ID,
      providerStatus: ProviderStatus.CONNECTED,
      workerStatus: WorkerStatus.STARTED,
      wsStatus: "OPEN",
      restartCount: 0,
    });

    expect(worker.eventListener).toBeDefined();
    expect(worker.directory).toBeDefined();
    expect(mongoose.startSession).toBeCalledTimes(1);
    expect(worker.directory?.init).toBeCalledTimes(1);
    expect(mockSession.endSession).toBeCalledTimes(1);

    expect(worker.directory?.subscribeToEvents).toBeCalledTimes(1);
    expect((worker.provider as any).handlers.block).toBeDefined();
    expect(subscribeToUserBalancesLoading).toBeCalledTimes(1);

    // checking block number tracking
    const BLOCK_NUMBER = 15;
    (worker.provider as any).handlers.block(BLOCK_NUMBER);
    expect(worker.blockNumberBeforeDisconnect).toBe(BLOCK_NUMBER);

    (worker.provider as any).handlers.error();
    await waitForWorkerToStop(worker);
  });

  test("should manage connection establishment errors without creating directory", async () => {
    (AutoWebSocketProvider as any).mockImplementationOnce(() => {
      const base = mockProviderBase();

      return {
        ...base,
        websocket: {
          readyState: 0,
        },
        ready: new Promise((resolve, reject) => {
          reject(new Error("sample error"));
        }),
      };
    });

    (EventModel as any).find.mockResolvedValue([]);
    (EventModel as any).deleteMany.mockResolvedValueOnce([]);

    const worker = new ChainWorker(0, RPC, DIRECTORY, CHAIN_ID);

    expect(worker.provider).toBeDefined();
    expect(worker.provider?.on).toHaveBeenNthCalledWith(1, "error", expect.anything());
    expect(worker.wsWatch).toBeDefined();
    expect(worker.worker).toBeDefined();

    expect(Metrics.connectionFailedCounterPerNetId[CHAIN_ID]).toBeUndefined();
    expect(Metrics.workerStateGaugePerNetId[CHAIN_ID]).toBeUndefined();
    expect(worker.restartCount).toBe(0);

    const provider = worker.provider;

    // waiting for worker to cleanup before expecting results
    await waitForWorkerToStop(worker);

    expect(Metrics.connectionFailedCounterPerNetId[CHAIN_ID]).toBe(1);
    expect(Metrics.workerStateGaugePerNetId[CHAIN_ID]).toBe(0);
    expect(worker.restartCount).toBe(1);

    expect(provider?.removeAllListeners).toBeCalledTimes(1);
    expect(provider?.destroy).toBeCalledTimes(1);
    expect(worker.directory).toBeUndefined();
    expect(worker.provider).toBeUndefined();
    expect(worker.eventListener).toBeUndefined();
    expect(worker.worker).toBeUndefined();
    expect(worker.wsWatch).toBeUndefined();
    expect(worker.pingInterval).toBeUndefined();
    expect(worker.pongTimeout).toBeUndefined();

    expect((EventModel as any).find).toBeCalledTimes(2);
    expect((EventModel as any).deleteMany).toBeCalledTimes(1);
  });

  test("should manage provider error event creating directory", async () => {
    (AutoWebSocketProvider as any).mockReturnValueOnce(mockProviderBase());

    (EventModel as any).find.mockResolvedValue([]);
    (EventModel as any).deleteMany.mockResolvedValueOnce([]);

    const worker = new ChainWorker(0, RPC, DIRECTORY, CHAIN_ID);

    expect(worker.provider).toBeDefined();
    expect(worker.provider?.on).toHaveBeenNthCalledWith(1, "error", expect.anything());
    expect(worker.wsWatch).toBeDefined();
    expect(worker.worker).toBeDefined();

    expect(Metrics.connectionFailedCounterPerNetId[CHAIN_ID]).toBeUndefined();
    expect(Metrics.workerStateGaugePerNetId[CHAIN_ID]).toBeUndefined();
    expect(worker.restartCount).toBe(0);

    const provider = worker.provider;

    await waitForWorkerToStart(worker);

    // triggering error
    (worker as any).provider.handlers.error();

    await waitForWorkerToStop(worker);

    expect(Metrics.connectionFailedCounterPerNetId[CHAIN_ID]).toBe(0);
    expect(Metrics.workerStateGaugePerNetId[CHAIN_ID]).toBe(0);
    expect(worker.restartCount).toBe(1);

    expect(provider?.removeAllListeners).toBeCalledTimes(1);
    expect(provider?.destroy).toBeCalledTimes(1);
    expect(worker.directory).toBeUndefined();
    expect(worker.provider).toBeUndefined();
    expect(worker.eventListener).toBeUndefined();
    expect(worker.worker).toBeUndefined();
    expect(worker.wsWatch).toBeUndefined();
    expect(worker.pingInterval).toBeUndefined();
    expect(worker.pongTimeout).toBeUndefined();

    expect((EventModel as any).find).toBeCalledTimes(2);
    expect((EventModel as any).deleteMany).toBeCalledTimes(1);
  });

  test("should catch worker errors and stop", async () => {
    (AutoWebSocketProvider as any).mockReturnValueOnce(mockProviderBase());

    (EventModel as any).find.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    (Directory as any).mockImplementationOnce(() => {
      return {
        eventsListener: {},
        init: jest.fn(async () => {
          await new Promise((resolve) => setTimeout(resolve, 200));
          throw new Error("directory init error");
        }),
        destroy: jest.fn(),
        subscribeToEvents: jest.fn(),
      };
    });

    const worker = new ChainWorker(0, RPC, DIRECTORY, CHAIN_ID);
    await waitForWorkerToStart(worker);
    await waitForWsToConnect(worker);

    expect(worker.status()).toEqual({
      index: 0,
      rpc: RPC,
      directory: DIRECTORY,
      name: "test",
      chainId: CHAIN_ID,
      providerStatus: ProviderStatus.CONNECTED,
      workerStatus: WorkerStatus.STARTED,
      wsStatus: "OPEN",
      restartCount: 0,
    });

    expect(worker.directory?.init).toBeCalledTimes(1);

    await waitForWorkerToStop(worker);
  });
});
