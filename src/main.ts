import { useServer } from "graphql-ws/lib/use/ws";
import { createYoga, useLogger } from "graphql-yoga";
import { createServer } from "http";
import mongoose from "mongoose";
import { WebSocketServer } from "ws";
import { Config } from "./config";
import { encodeEvents } from "./encodeevents";
import { schema } from "./graphql";
import { rootLogger } from "./util";
import { ChainHealth, ChainWorker, WorkerStatus } from "./worker";

export class Main {
  private static readonly log = rootLogger.child({ name: "Main" });
  private static readonly yogaLog = Main.log.child({ name: "yoga" });

  private static networks = Config.networks;

  private static keepAlive: NodeJS.Timer | undefined;

  private static readonly workers: ChainWorker[] = [];

  static readonly topicsMap: Record<string, Record<string, string>> =
    encodeEvents();

  private static readonly yoga = createYoga({
    schema,
    graphiql: Config.api.enableGraphiql
      ? {
          subscriptionsProtocol: "WS",
        }
      : false,
    cors: {
      origin: Config.api.corsOrigins,
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
  });

  private static readonly httpServer = createServer(Main.yoga);
  private static readonly wsServer = new WebSocketServer({
    server: Main.httpServer,
    path: Main.yoga.graphqlEndpoint,
  });

  private static readonly bindAddress = Config.api.bindAddress;
  private static readonly bindPort = Config.api.bindPort;

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
    Main.log.info(`Connecting to MongoDB at ${Config.db.uri}`);
    return Main.connectDB()
      .then(() => {
        Main.log.info("MongoDB connected !");

        Main.networks.forEach((network, index) =>
          Main.connectChain(
            index,
            network.uri,
            network.directory,
            network.chainId
          )
        );

        this.keepAlive = setInterval(() => {
          for (const worker of Main.workers) {
            if (worker.workerStatus === WorkerStatus.DEAD) {
              Main.log.info(
                `Restarting worker on rpc ${worker.rpc} and chain ${worker.name} ${worker.chainId}`
              );
              worker.start();
            }
          }
        }, Config.delays.workerRestartDelayMs);

        Main.httpServer.listen(Main.bindPort, Main.bindAddress, () =>
          Main.log.info(
            `GraphQL API server started at http://${Main.bindAddress}:${Main.bindPort}/`
          )
        );
      })
      .catch((err) => {
        Main.log.error({ msg: "Error during application startup !", err });
        if (this.keepAlive !== undefined) {
          clearInterval(this.keepAlive);
          this.keepAlive = undefined;
        }
      });
  }

  static health(): ChainHealth[] {
    return this.workers.map((worker) => worker.status());
  }

  private static connectDB() {
    mongoose.set("strictQuery", true);
    return mongoose.connect(Config.db.uri);
  }

  private static connectChain(
    index: number,
    rpc: string,
    directory: string,
    chainId: number
  ) {
    Main.log.info(
      `Creating provider and starting worker for network ${chainId} : ${rpc} and directory ${directory}`
    );

    Main.workers.push(new ChainWorker(index, rpc, directory, chainId));
  }
}
