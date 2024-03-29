import { buildHTTPExecutor } from "@graphql-tools/executor-http";
import gql from "graphql-tag";
import mongoose from "mongoose";
import { Socket } from "net";
import { Config } from "../config";
import { MainClass } from "../main";
import { ChainWorker } from "../worker";

jest.unmock("ws");
jest.unmock("ethers");
jest.unmock("graphql-yoga");

jest.mock("../config");
jest.mock("../worker");

describe("Main class", () => {
  it("Networks config check", () => {
    expect(Config.networks.length).toBe(2);
  });

  it("Constructor initialization", () => {
    const main = new MainClass();

    expect(main.bindAddress).toBeDefined();
    expect(main.bindPort).toBeDefined();
    expect(main.networks).toBeDefined();
    expect(main.networks.length).toBe(1);
    expect(main.httpServer).toBeDefined();
    expect(main.workers).toEqual([]);
    expect(main.keepAlive).toBeUndefined();
    expect(main.healthTimer).toBeUndefined();
  });

  it("should return empty health check initially", () => {
    const main = new MainClass();

    expect(main.health()).toEqual([]);
  });

  it("start function should connect to mongodb before starting api", async () => {
    const main = new MainClass();

    const sockets = new Set<Socket>();

    (mongoose as any).connect.mockResolvedValueOnce(Promise.resolve);

    const listenerCountBefore = main.httpServer.listenerCount("listening");
    expect(main.httpServer.listening).toBe(false);

    main.httpServer.on("connection", (socket) => {
      sockets.add(socket);
      main.httpServer.once("close", () => {
        sockets.delete(socket);
      });
    });

    await main.start();

    expect(main.keepAlive).toBeDefined();
    expect(main.healthTimer).toBeDefined();
    expect(mongoose.set).toHaveBeenNthCalledWith(1, "strictQuery", true);
    expect(mongoose.connect).toHaveBeenNthCalledWith(1, Config.db.uri);
    expect(main.workers.length).toBe(main.networks.length);
    expect(main.httpServer.listenerCount("listening")).toBe(listenerCountBefore + 1);

    await waitForServerStart(main);

    // trying some gql queries
    const executor = buildHTTPExecutor();

    const healthSub = await executor({
      document: gql`
        subscription testSub {
          health {
            restartCount
          }
        }
      `,
    });

    await healthSub;

    await executor({
      document: gql`
        query testQuery {
          health {
            restartCount
          }
        }
      `,
    });

    await closeServerAndWait(main, sockets);
  });

  it("failure after start should dispose of timers", async () => {
    const main = new MainClass();

    (mongoose as any).connect.mockImplementationOnce(async () => {
      throw new Error();
    });

    main.keepAlive = setInterval(() => {}, 1000);
    main.healthTimer = setInterval(() => {}, 1000);

    await main.start();

    expect(mongoose.connect).toBeCalled();
    expect(main.keepAlive).toBeUndefined();
    expect(main.healthTimer).toBeUndefined();
  });

  it("dead worker should be respawned automatically", async () => {
    const main = new MainClass();

    const sockets = new Set<Socket>();

    (mongoose as any).connect.mockResolvedValueOnce(Promise.resolve());

    main.httpServer.on("connection", (socket) => {
      sockets.add(socket);
      main.httpServer.once("close", () => {
        sockets.delete(socket);
      });
    });

    expect(main.workers.length).toBe(0);

    await main.start();
    await waitForServerStart(main);

    expect(main.workers.length).toBe(1);
    expect(main.workers[0].start).toBeCalledTimes(1);

    main.workers[0].workerStatus = "DEAD";

    await waitForWorkerToRestart(main.workers[0]);

    expect(main.workers[0].start).toBeCalledTimes(1);

    await closeServerAndWait(main, sockets);
  });

  function waitForServerStart(main: MainClass): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const interval = setInterval(() => {
        if (main.httpServer.listening) {
          clearInterval(interval);
          clearTimeout(timeout);
          resolve();
        }
      }, 1);

      const timeout = setTimeout(() => {
        clearInterval(interval);
        reject(new Error("Server did not start in time"));
      }, 500);
    });
  }

  function waitForWorkerToRestart(worker: ChainWorker): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const interval = setInterval(() => {
        if ((worker as any).start.mock.calls.length > 0) {
          clearInterval(interval);
          clearTimeout(timeout);
          resolve();
        }
      }, 1);

      const timeout = setTimeout(() => {
        clearInterval(interval);
        reject(new Error("Server did not start in time"));
      }, 500);
    });
  }

  async function closeServerAndWait(main: MainClass, sockets: Set<Socket>): Promise<void> {
    if (main.keepAlive !== undefined) {
      clearInterval(main.keepAlive);
    }
    if (main.healthTimer !== undefined) {
      clearInterval(main.healthTimer);
    }

    await new Promise<void>((resolve, reject) =>
      main.httpServer.close((err) => {
        if (err !== undefined) {
          reject(err);
        }

        for (const socket of sockets) {
          socket.destroy();
          sockets.delete(socket);
        }

        resolve();
      }),
    );

    expect(main.httpServer.listening).toBe(false);
  }
});
