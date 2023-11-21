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

const log = rootLogger.child({ name: "Main" });
const yogaLog = log.child({ name: "yoga" });

export class MainClass {
  readonly networks = Config.networks;

  keepAlive: NodeJS.Timeout | undefined;

  readonly workers: ChainWorker[] = [];

  readonly yoga = createYoga({
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
        yogaLog.trace({ yogaLevel: "debug", args });
      },
      info(...args) {
        yogaLog.trace({ yogaLevel: "info", args });
      },
      warn(...args) {
        yogaLog.trace({ yogaLevel: "warn", args });
      },
      error(...args) {
        yogaLog.trace({ yogaLevel: "error", args });
      },
    },
    plugins: [
      useLogger({
        logFn: (eventName, args) => {
          yogaLog.trace({ eventName, args });
        },
      }),
      usePrometheus(),
      useEventsExporter(),
    ],
  });

  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  readonly httpServer = createServer(this.yoga);
  readonly wsServer = new WebSocketServer({
    server: this.httpServer,
    path: this.yoga.graphqlEndpoint,
  });

  readonly bindAddress = Config.api.bindAddress;
  readonly bindPort = Config.api.bindPort;

  init() {
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
      this.wsServer,
    );
  }

  async start() {
    log.info(`Connecting to MongoDB at ${Config.db.uri}`);
    await this.connectDB()
      .then(() => {
        log.info("MongoDB connected !");

        this.networks.forEach((network, index) => {
          this.connectChain(index, network.uri, network.directory, network.chainId);
        });

        this.keepAlive = setInterval(() => {
          for (const worker of this.workers) {
            if (worker.workerStatus === WorkerStatus.DEAD) {
              log.info({
                msg: `Restarting worker on rpc ${worker.rpc} and chain ${worker.name} ${worker.chainId}`,
                chainId: worker.chainId,
              });
              worker.start();
            }
          }
        }, Config.delays.workerRestartDelayMs);

        this.httpServer.listen(this.bindPort, this.bindAddress, () => {
          log.info(`GraphQL API server started at http://${this.bindAddress}:${this.bindPort}/`);
        });
      })
      .catch((err) => {
        log.error({ msg: "Error during application startup !", err });
        if (this.keepAlive !== undefined) {
          clearInterval(this.keepAlive);
          this.keepAlive = undefined;
        }
      });
  }

  health(): ChainHealth[] {
    return this.workers.map((worker) => worker.status());
  }

  private async connectDB() {
    mongoose.set("strictQuery", true);
    return await mongoose.connect(Config.db.uri);
  }

  private connectChain(index: number, rpc: string, directory: string, chainId: number) {
    log.info({
      msg: `Creating provider and starting worker for network ${chainId} : ${rpc} and directory ${directory}`,
      chainId,
    });

    this.workers.push(new ChainWorker(index, rpc, directory, chainId));
  }
}

export const Main = new MainClass();
