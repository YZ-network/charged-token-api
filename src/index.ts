import { ethers } from "ethers";
import { useServer } from "graphql-ws/lib/use/ws";
import { createYoga, useLogger } from "graphql-yoga";
import { createServer } from "http";
import mongoose from "mongoose";
import { WebSocketServer } from "ws";
import { schema } from "./graphql";
import { rootLogger } from "./util";
import { worker } from "./worker";

const log = rootLogger.child({ name: "index" });
const yogaLog = log.child({ name: "yoga" });

log.debug("Configuring Yoga GraphQL API");

const yoga = createYoga({
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
  ],
});

log.debug("Configuring HTTP & WS servers");

const httpServer = createServer(yoga);
const wsServer = new WebSocketServer({
  server: httpServer,
  path: yoga.graphqlEndpoint,
});

const bindAddress = process.env.BIND_ADDRESS || "localhost";
const bindPort = process.env.BIND_PORT ? Number(process.env.BIND_PORT) : 4000;

log.debug("Integrating everything");

// Integrate Yoga's Envelop instance and NodeJS server with graphql-ws
useServer(
  {
    execute: (args: any) => args.rootValue.execute(args),
    subscribe: (args: any) => args.rootValue.subscribe(args),
    onSubscribe: async (ctx, msg) => {
      const { schema, execute, subscribe, contextFactory, parse, validate } =
        yoga.getEnveloped({
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
  wsServer
);

log.info("Connecting to MongoDB");

mongoose.set("strictQuery", true);
mongoose
  .connect(`mongodb://${process.env.MONGODB_HOST}:27017/test`)
  .then(() => {
    log.debug("MongoDB connected !");

    const rpcs = process.env.JSON_RPC_URL!.split(",");
    const directories = process.env.DIRECTORY_ADDRESS!.split(",");

    for (let i = 0; i < rpcs.length; i++) {
      log.info(
        `Creating provider and starting worker for network : ${rpcs[i]} and directory ${directories[i]}`
      );

      const provider = new ethers.providers.WebSocketProvider(rpcs[i]);
      provider.websocket.onerror = function (event) {
        log.error({
          msg: `Websocket establishment error : ${event.message}`,
          event,
        });
      };

      provider.ready
        .then((network) => {
          log.info({ msg: "Connected to network", network });

          worker(provider, directories[i]).catch((err) => {
            log.error({ msg: `Error occured during load : ${rpcs[i]}`, err });
            mongoose.disconnect();
            process.exit(1);
          });
        })
        .catch((err) => {
          log.error({ msg: `Failed starting worker on RPC ${rpcs[i]}`, err });
        });
    }

    httpServer.listen(bindPort, bindAddress, () =>
      log.info(
        `GraphQL API server started at http://${bindAddress}:${bindPort}/`
      )
    );
  })
  .catch((err) => log.error({ msg: "Error connecting to database :", err }));
