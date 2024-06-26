import { AutoWebSocketProvider } from "../blockchain/AutoWebSocketProvider";
import type { AbstractBroker } from "../core/AbstractBroker";
import type { AbstractDbRepository } from "../core/AbstractDbRepository";
import { MockBroker } from "../core/__mocks__/MockBroker";
import { MockDbRepository } from "../core/__mocks__/MockDbRepository";
import { Metrics } from "../metrics";
import { subscribeToUserBalancesLoading } from "../subscriptions/subscribeToUserBalances";
import { ChainWorker } from "../worker";

jest.mock("../config");
jest.mock("../blockchain/topics");
jest.mock("../blockchain/AutoWebSocketProvider");
jest.mock("../core/ContractsRegistry");
jest.mock("../subscriptions/subscribeToUserBalances");

describe("ChainWorker", () => {
  const RPC = "ws://127.0.0.1:8545";
  const DIRECTORY = "0xDIRECTORY";
  const CHAIN_ID = 1337;

  let db: jest.Mocked<AbstractDbRepository>;
  let broker: jest.Mocked<AbstractBroker>;

  beforeEach(() => {
    db = new MockDbRepository() as jest.Mocked<AbstractDbRepository>;
    broker = new MockBroker() as jest.Mocked<AbstractBroker>;
    Metrics.chainInit(CHAIN_ID);
  });

  afterEach(() => {
    Metrics.reset();
  });

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
      off: jest.fn((event) => {
        mockHandlers[event] = undefined;
      }),
      ready: Promise.resolve({
        name: "test",
        chainId: 1337,
      }),
      getBlockNumber: jest.fn(),
      getLogs: jest.fn(),
      removeAllListeners: jest.fn(),
      destroy: jest.fn(),
    };
  }

  async function waitForWorkerToStart(worker: ChainWorker) {
    let timeout: NodeJS.Timeout | undefined;

    const waitPromise = new Promise((resolve, reject) => {
      const interval = setInterval(() => {
        if (worker.providerStatus === "CONNECTED" && worker.workerStatus === "STARTED") {
          clearInterval(interval);
          resolve(undefined);
        }
      }, 1);

      timeout = setTimeout(() => {
        clearInterval(interval);
        reject(
          new Error(
            `Timeout reached ! killed it, workerStatus : ${worker.workerStatus} providerStatus: ${worker.providerStatus}`,
          ),
        );
      }, 1000);
    });

    await waitPromise;

    clearTimeout(timeout);
  }

  async function waitForWorkerToStop(worker: ChainWorker) {
    let timeout: NodeJS.Timeout | undefined;

    const waitPromise = new Promise((resolve, reject) => {
      const interval = setInterval(() => {
        if (worker.providerStatus === "DISCONNECTED" && worker.workerStatus === "DEAD") {
          clearInterval(interval);
          resolve(undefined);
        }
      }, 1);

      timeout = setTimeout(() => {
        clearInterval(interval);
        reject(
          new Error(
            `Timeout reached ! killed it, providerStatus=${worker.providerStatus} workerStatus=${worker.workerStatus} wsStatus=${worker.wsStatus}`,
          ),
        );
      }, 1000);
    });

    await waitPromise;

    clearTimeout(timeout);
  }

  test("should try connecting upon start", async () => {
    (AutoWebSocketProvider as any).mockImplementationOnce(() => {
      const base = mockProviderBase();

      return {
        ...base,
        websocket: {
          readyState: 0,
        },
        ready: Promise.resolve(),
      };
    });

    db.getAllEvents.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const worker = new ChainWorker(0, RPC, DIRECTORY, CHAIN_ID, db, broker);
    await worker.start();

    expect(worker.provider).toBeDefined();
    expect(worker.provider?.on).toHaveBeenNthCalledWith(1, "error", expect.anything());
    expect(worker.wsWatch).toBeDefined();
    expect(worker.workerPromise).toBeDefined();

    expect(worker.status()).toEqual({
      index: 0,
      rpc: RPC,
      directory: DIRECTORY,
      name: undefined,
      chainId: CHAIN_ID,
      providerStatus: "STARTING",
      workerStatus: "WAITING",
      wsStatus: "CONNECTING",
      restartCount: 0,
    });

    clearInterval(worker.wsWatch);
  });

  test("should initialize directory upon connection", async () => {
    (AutoWebSocketProvider as any).mockReturnValueOnce(mockProviderBase());

    const worker = new ChainWorker(0, RPC, DIRECTORY, CHAIN_ID, db, broker);
    await worker.start();

    await waitForWorkerToStart(worker);

    expect(worker.status()).toEqual({
      index: 0,
      rpc: RPC,
      directory: DIRECTORY,
      name: "test",
      chainId: CHAIN_ID,
      providerStatus: "CONNECTED",
      workerStatus: "STARTED",
      wsStatus: "OPEN",
      restartCount: 0,
    });

    expect(worker.blockchain).toBeDefined();
    expect(worker.db).toBeDefined();
    expect(worker.contractsRegistry).toBeDefined();
    expect(worker.contractsRegistry?.registerDirectory).toBeCalledWith(DIRECTORY);
    expect(subscribeToUserBalancesLoading).toBeCalledWith(CHAIN_ID, db, worker.blockchain, broker);

    (worker.provider as any).handlers.error("WebSocket closed");
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

    const worker = new ChainWorker(0, RPC, DIRECTORY, CHAIN_ID, db, broker);
    await worker.start();

    expect(worker.provider).toBeDefined();
    expect(worker.provider?.on).toHaveBeenNthCalledWith(1, "error", expect.anything());
    expect(worker.wsWatch).toBeDefined();
    expect(worker.workerPromise).toBeDefined();

    expect(Metrics.connectionFailedCounterPerNetId[CHAIN_ID]).toBe(0);
    expect(Metrics.workerStateGaugePerNetId[CHAIN_ID]).toBe(0);
    expect(worker.restartCount).toBe(0);

    const provider = worker.provider;

    // waiting for worker to cleanup before expecting results
    await waitForWorkerToStop(worker);

    expect(Metrics.connectionFailedCounterPerNetId[CHAIN_ID]).toBe(1);
    expect(Metrics.workerStateGaugePerNetId[CHAIN_ID]).toBe(0);
    expect(worker.restartCount).toBe(1);

    expect(provider?.removeAllListeners).toBeCalledTimes(1);
    expect(provider?.destroy).toBeCalledTimes(1);
    expect(broker.removeSubscriptions).toBeCalledWith(CHAIN_ID);
    expect(worker.provider).toBeUndefined();
    expect(worker.blockchain).toBeUndefined();
    expect(worker.workerPromise).toBeUndefined();
    expect(worker.wsWatch).toBeUndefined();
  });

  test("should manage provider error event creating directory", async () => {
    (AutoWebSocketProvider as any).mockReturnValueOnce(mockProviderBase());

    const worker = new ChainWorker(0, RPC, DIRECTORY, CHAIN_ID, db, broker);
    await worker.start();

    expect(worker.provider).toBeDefined();
    expect(worker.provider?.on).toHaveBeenNthCalledWith(1, "error", expect.anything());
    expect(worker.wsWatch).toBeDefined();
    expect(worker.workerPromise).toBeDefined();

    expect(Metrics.connectionFailedCounterPerNetId[CHAIN_ID]).toBe(0);
    expect(Metrics.workerStateGaugePerNetId[CHAIN_ID]).toBe(0);
    expect(worker.restartCount).toBe(0);

    const provider = worker.provider;

    await waitForWorkerToStart(worker);

    // triggering error
    (worker as any).provider.handlers.error("WebSocket closed");

    await waitForWorkerToStop(worker);

    expect(Metrics.connectionFailedCounterPerNetId[CHAIN_ID]).toBe(0);
    expect(Metrics.workerStateGaugePerNetId[CHAIN_ID]).toBe(0);
    expect(worker.restartCount).toBe(1);

    expect(provider?.removeAllListeners).toBeCalledTimes(1);
    expect(provider?.destroy).toBeCalledTimes(1);
    expect(broker.removeSubscriptions).toBeCalledWith(CHAIN_ID);
    expect(worker.provider).toBeUndefined();
    expect(worker.blockchain).toBeUndefined();
    expect(worker.workerPromise).toBeUndefined();
    expect(worker.wsWatch).toBeUndefined();
  });

  /* TODO rewrite this test
  test("should catch worker errors and stop", async () => {
    (AutoWebSocketProvider as any).mockReturnValueOnce(mockProviderBase());

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

    const worker = new ChainWorker(0, RPC, DIRECTORY, CHAIN_ID, db, broker);
    await waitForWorkerToStart(worker);
    await waitForWsToConnect(worker);

    expect(worker.status()).toEqual({
      index: 0,
      rpc: RPC,
      directory: DIRECTORY,
      name: "test",
      chainId: CHAIN_ID,
      providerStatus: "CONNECTED",
      workerStatus: "STARTED",
      wsStatus: "OPEN",
      restartCount: 0,
    });

    expect(worker.directory?.init).toBeCalledTimes(1);

    await waitForWorkerToStop(worker);
  });
  */
});
