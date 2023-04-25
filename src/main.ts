import { useServer } from "graphql-ws/lib/use/ws";
import { createYoga, useLogger } from "graphql-yoga";
import { createServer } from "http";
import mongoose from "mongoose";
import { WebSocketServer } from "ws";
import { schema } from "./graphql";
import { rootLogger } from "./util";
import { ChainHealth, ChainWorker, WorkerStatus } from "./worker";

export class Main {
  private static readonly log = rootLogger.child({ name: "Main" });
  private static readonly yogaLog = Main.log.child({ name: "yoga" });

  private static rpcs = process.env.JSON_RPC_URL!.split(",");
  private static directories = process.env.DIRECTORY_ADDRESS!.split(",");

  private static readonly workers: ChainWorker[] = [];
  private static keepAlive: NodeJS.Timer | undefined;

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
        Main.log.info("MongoDB connected !");

        for (let i = 0; i < Main.rpcs.length; i++) {
          Main.connectChain(i, Main.rpcs[i], Main.directories[i]);
        }

        this.keepAlive = setInterval(() => {
          for (const worker of Main.workers) {
            if (worker.workerStatus === WorkerStatus.DEAD) {
              Main.log.info(
                `Restarting worker on rpc ${worker.rpc} and chain ${worker.name} ${worker.chainId}`
              );
              worker.start();
            }
          }
        }, 30000);

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
    return this.workers.map((worker) => worker.status());
  }

  private static connectDB() {
    mongoose.set("strictQuery", true);
    return mongoose.connect(
      `mongodb://${process.env.MONGODB_HOST}:27017/test?replicaSet=rs0`
    );
  }

  private static connectChain(index: number, rpc: string, directory: string) {
    Main.log.info(
      `Creating provider and starting worker for network : ${rpc} and directory ${directory}`
    );

    Main.workers.push(new ChainWorker(index, rpc, directory));
  }
}
