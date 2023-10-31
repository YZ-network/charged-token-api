import mongoose from "mongoose";
import { Socket } from "net";
import { Config } from "../config";
import { Main } from "../main";

jest.unmock("ws");

jest.mock("../graphql");
jest.mock("../exporter");
jest.mock("../worker");

describe("Main class", () => {
  test("Networks config check", () => {
    expect(Config.networks.length).toBeGreaterThan(0);
  });

  test("Constructor initialization", () => {
    expect(Main.bindAddress).toBeDefined();
    expect(Main.bindPort).toBeDefined();
    expect(Main.networks).toBeDefined();
    expect(Main.yoga).toBeDefined();
    expect(Main.httpServer).toBeDefined();
    expect(Main.wsServer).toBeDefined();
    expect(Main.workers).toEqual([]);
    expect(Main.keepAlive).toBeUndefined();
  });

  test("should return empty health check initially", () => {
    expect(Main.health()).toEqual([]);
  });

  test("init function should connect ws server to graphql api", () => {
    expect(Main.wsServer.listenerCount("error")).toBe(0);
    expect(Main.wsServer.listenerCount("connection")).toBe(0);
    expect(Main.wsServer.listenerCount("close")).toBe(0);

    Main.init();

    expect(Main.wsServer.listenerCount("error")).toBe(1);
    expect(Main.wsServer.listenerCount("connection")).toBe(1);
  });

  test("start function should connect to mongodb before starting api", async () => {
    const sockets = new Set<Socket>();

    (mongoose as any).connect.mockImplementationOnce(
      async () =>
        new Promise<void>((resolve) => {
          resolve();
        }),
    );

    expect(Main.httpServer.listenerCount("listening")).toBe(1);
    expect(Main.httpServer.listening).toBe(false);

    Main.httpServer.on("connection", (socket) => {
      sockets.add(socket);
      Main.httpServer.once("close", () => {
        sockets.delete(socket);
      });
    });

    await Main.start();

    expect(Main.keepAlive).toBeDefined();
    expect(mongoose.set).toHaveBeenNthCalledWith(1, "strictQuery", true);
    expect(mongoose.connect).toHaveBeenNthCalledWith(1, Config.db.uri);
    expect(Main.workers.length).toBe(Config.networks.length);
    expect(Main.httpServer.listenerCount("listening")).toBe(2);

    await new Promise<void>((resolve, reject) => {
      const interval = setInterval(() => {
        if (Main.httpServer.listening) {
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
    expect(Main.httpServer.listening).toBe(true);

    clearInterval(Main.keepAlive);
    await new Promise<void>((resolve, reject) =>
      Main.httpServer.close((err) => {
        if (err !== undefined) {
          console.error("Could not close server", err);
          reject(err);
        }

        for (const socket of sockets) {
          socket.destroy();
          sockets.delete(socket);
        }

        resolve();
      }),
    );

    expect(Main.httpServer.listening).toBe(false);
  });
});
