import { useServer } from "graphql-ws/lib/use/ws";
import { createYoga, useLogger } from "graphql-yoga";
import { createServer } from "http";
import mongoose from "mongoose";
import { WebSocketServer } from "ws";
import { Config } from "./config";
import { WorkerStatus } from "./enums";
import { useEventsExporter } from "./exporter";
import { schema } from "./graphql";
import { usePrometheus } from "./prometheus";
import { rootLogger } from "./util";
import { ChainWorker, type ChainHealth } from "./worker";

export class Main {
  private static readonly log = rootLogger.child({ name: "Main" });
  private static readonly yogaLog = Main.log.child({ name: "yoga" });

  private static readonly networks = Config.networks;

  private static keepAlive: NodeJS.Timeout | undefined;

  private static readonly workers: ChainWorker[] = [];

  private static readonly yoga = createYoga({
    schema,
    graphiql: Config.api.enableGraphiql
      ? {
          subscriptionsProtocol: "WS",
        }
      : false,
    cors: (request) => {
      const requestOrigin = request.headers.get("origin") as string;
      return {
        origin: requestOrigin,
        methods: ["POST", "OPTIONS"],
      };
    },
    /* {
      origin: Config.api.corsOrigins,
      methods: ["POST", "OPTIONS"],
    } */
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
      usePrometheus(),
      useEventsExporter(),
    ],
  });

  // eslint-disable-next-line @typescript-eslint/no-misused-promises
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
          const { schema, execute, subscribe, contextFactory, parse, validate } = Main.yoga.getEnveloped({
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
          if (errors.length !== undefined && errors.length > 0) return errors;
          return args;
        },
      },
      Main.wsServer,
    );
  }

  static async start() {
    Main.log.info(`Connecting to MongoDB at ${Config.db.uri}`);
    await Main.connectDB()
      .then(() => {
        Main.log.info("MongoDB connected !");

        Main.networks.forEach((network, index) => {
          Main.connectChain(index, network.uri, network.directory, network.chainId);
        });

        this.keepAlive = setInterval(() => {
          for (const worker of Main.workers) {
            if (worker.workerStatus === WorkerStatus.DEAD) {
              Main.log.info({
                msg: `Restarting worker on rpc ${worker.rpc} and chain ${worker.name} ${worker.chainId}`,
                chainId: worker.chainId,
              });
              worker.start();
            }
          }
        }, Config.delays.workerRestartDelayMs);

        Main.httpServer.listen(Main.bindPort, Main.bindAddress, () => {
          Main.log.info(`GraphQL API server started at http://${Main.bindAddress}:${Main.bindPort}/`);
        });
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

  private static async connectDB() {
    mongoose.set("strictQuery", true);
    return await mongoose.connect(Config.db.uri);
  }

  private static connectChain(index: number, rpc: string, directory: string, chainId: number) {
    Main.log.info({
      msg: `Creating provider and starting worker for network ${chainId} : ${rpc} and directory ${directory}`,
      chainId,
    });

    Main.workers.push(new ChainWorker(index, rpc, directory, chainId));
  }
}
