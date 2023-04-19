import { ethers } from "ethers";
import { useServer } from "graphql-ws/lib/use/ws";
import { createYoga, useLogger } from "graphql-yoga";
import { createServer } from "http";
import mongoose from "mongoose";
import { WebSocket, WebSocketServer } from "ws";
import { schema } from "./graphql";
import { rootLogger } from "./util";
import { worker } from "./worker";

enum ProviderStatus {
  CONNECTING = "CONNECTING",
  CONNECTED = "CONNECTED",
  DISCONNECTED = "DISCONNECTED",
}

enum WorkerStatus {
  WAITING = "WAITING",
  STARTED = "STARTED",
  CRASHED = "CRASHED",
}

const WsStatus = ["CONNECTING", "OPEN", "CLOSING", "CLOSED"];

interface Chain {
  index: number;
  rpc: string;
  directory: string;
  name?: string;
  chainId?: number;
  provider?: ethers.providers.WebSocketProvider;
  worker?: Promise<void>;
  providerStatus: ProviderStatus;
  workerStatus: WorkerStatus;
  wsStatus: string;
}

interface ChainHealth {
  rpc: string;
  directory: string;
  name?: string;
  chainId?: number;
  providerStatus: ProviderStatus;
  workerStatus: WorkerStatus;
}

export class Main {
  private static readonly log = rootLogger.child({ name: "Main" });
  private static readonly yogaLog = Main.log.child({ name: "yoga" });

  private static rpcs = process.env.JSON_RPC_URL!.split(",");
  private static directories = process.env.DIRECTORY_ADDRESS!.split(",");

  private static readonly workers: Chain[] = [];

  private static readonly yoga = createYoga({
    schema,
    graphiql: {
      subscriptionsProtocol: "WS",
    },
    cors: {
      origin: process.env.CORS_ORIGINS,
      methods: ["POST", "OPTIONS"],
    },
    logging: {
      debug(...args) {
        Main.yogaLog.trace({ yogaLevel: "debug", args });
      },
      info(...args) {
        Main.yogaLog.trace({ yogaLevel: "info", args });
      },
      warn(...args) {
        Main.yogaLog.trace({ yogaLevel: "warn", args });
      },
      error(...args) {
        Main.yogaLog.trace({ yogaLevel: "error", args });
      },
    },
    plugins: [
      useLogger({
        logFn: (eventName, args) => {
          Main.yogaLog.trace({ eventName, args });
        },
      }),
    ],
    context: {
      main: Main,
    },
  });

  private static readonly httpServer = createServer(Main.yoga);
  private static readonly wsServer = new WebSocketServer({
    server: Main.httpServer,
    path: Main.yoga.graphqlEndpoint,
  });

  private static readonly bindAddress = process.env.BIND_ADDRESS || "localhost";
  private static readonly bindPort = process.env.BIND_PORT
    ? Number(process.env.BIND_PORT)
    : 4000;

  static init() {
    useServer(
      {
        execute: (args: any) => args.rootValue.execute(args),
        subscribe: (args: any) => args.rootValue.subscribe(args),
        onSubscribe: async (ctx, msg) => {
          const {
            schema,
            execute,
            subscribe,
            contextFactory,
            parse,
            validate,
          } = Main.yoga.getEnveloped({
            ...ctx,
            req: ctx.extra.request,
            socket: ctx.extra.socket,
            params: msg.payload,
          });

          const args = {
            schema,
            operationName: msg.payload.operationName,
            document: parse(msg.payload.query),
            variableValues: msg.payload.variables,
            contextValue: await contextFactory(),
            rootValue: {
              execute,
              subscribe,
            },
          };

          const errors = validate(args.schema, args.document);
          if (errors.length) return errors;
          return args;
        },
      },
      Main.wsServer
    );
  }

  static start() {
    return Main.connectDB()
      .then(() => {
        Main.log.debug("MongoDB connected !");

        for (let i = 0; i < Main.rpcs.length; i++) {
          Main.connectChain(i, Main.rpcs[i], Main.directories[i]);
        }

        Main.httpServer.listen(Main.bindPort, Main.bindAddress, () =>
          Main.log.info(
            `GraphQL API server started at http://${Main.bindAddress}:${Main.bindPort}/`
          )
        );
      })
      .catch((err) =>
        Main.log.error({ msg: "Error connecting to database :", err })
      );
  }

  static health(): ChainHealth[] {
    return this.workers.map(
      ({
        index,
        rpc,
        directory,
        name,
        chainId,
        providerStatus,
        workerStatus,
        wsStatus,
      }) => ({
        index,
        rpc,
        directory,
        name,
        chainId,
        providerStatus,
        workerStatus,
        wsStatus,
      })
    );
  }

  private static connectDB() {
    mongoose.set("strictQuery", true);
    return mongoose.connect(`mongodb://${process.env.MONGODB_HOST}:27017/test`);
  }

  private static connectChain(index: number, rpc: string, directory: string) {
    Main.log.info(
      `Creating provider and starting worker for network : ${rpc} and directory ${directory}`
    );

    const chain: Chain = {
      index,
      rpc,
      directory,
      providerStatus: ProviderStatus.CONNECTING,
      workerStatus: WorkerStatus.WAITING,
      wsStatus: "WAITING",
    };

    Main.workers.push(chain);

    Main.createProvider(chain);
    Main.createWorker(chain);
  }

  private static createProvider(chain: Chain) {
    chain.provider = new ethers.providers.WebSocketProvider(chain.rpc);
    chain.wsStatus = WsStatus[chain.provider!.websocket.readyState];

    const originalHandler = chain.provider.websocket.onerror;
    chain.provider.websocket.onerror = function (event) {
      Main.log.error({
        msg: `Websocket failure : ${event.message}`,
        event,
      });
      chain.providerStatus = ProviderStatus.DISCONNECTED;

      if (originalHandler) originalHandler(event);
    };

    chain.provider.ready
      .then((network) => {
        Main.log.info({ msg: "Connected to network", network });

        chain.chainId = network.chainId;
        chain.name = network.name;
        chain.providerStatus = ProviderStatus.CONNECTED;

        return network;
      })
      .catch((err) => {
        Main.log.error({
          msg: `Error connecting to network ${chain.rpc}`,
          err,
        });
        chain.providerStatus = ProviderStatus.DISCONNECTED;
        chain.wsStatus = WsStatus[chain.provider!.websocket.readyState];
      });

    setInterval(() => {
      chain.wsStatus = WsStatus[chain.provider!.websocket.readyState];

      if (
        chain.providerStatus !== ProviderStatus.DISCONNECTED &&
        ([WebSocket.CLOSING, WebSocket.CLOSED] as number[]).includes(
          chain.provider!.websocket.readyState
        )
      ) {
        Main.log.info(`Websocket crashed : ${chain.name} ${chain.chainId}`);
        chain.providerStatus = ProviderStatus.DISCONNECTED;
      }

      if (
        chain.providerStatus !== ProviderStatus.CONNECTING &&
        chain.provider!.websocket.readyState === WebSocket.CONNECTING
      ) {
        Main.log.info(`Websocket connecting : ${chain.name} ${chain.chainId}`);
        chain.providerStatus = ProviderStatus.CONNECTING;
      }

      if (
        chain.providerStatus !== ProviderStatus.CONNECTED &&
        chain.provider!.websocket.readyState === WebSocket.OPEN
      ) {
        Main.log.info(`Websocket connected : ${chain.name} ${chain.chainId}`);
        chain.providerStatus = ProviderStatus.CONNECTED;
      }
    }, 1000);
  }

  private static createWorker(chain: Chain) {
    chain.worker = chain
      .provider!.ready.then(() => {
        chain.workerStatus = WorkerStatus.STARTED;

        return worker(chain.provider!, chain.directory)
          .then(() => {
            Main.log.info(
              `Worker stopped itself on network ${chain.name} ${chain.chainId}`
            );
            chain.workerStatus = WorkerStatus.CRASHED;
          })
          .catch((err: any) => {
            Main.log.error({
              msg: `Worker crashed on : ${chain.rpc}, ${chain.name} ${chain.chainId}`,
              err,
            });
            chain.workerStatus = WorkerStatus.CRASHED;
          });
      })
      .catch((err) => {
        Main.log.error({
          msg: `Error connecting to rpc ${chain.rpc}`,
          err,
        });
        chain.providerStatus = ProviderStatus.DISCONNECTED;
      });
  }
}
