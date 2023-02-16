import { ethers } from "ethers";
import { useServer } from "graphql-ws/lib/use/ws";
import { createYoga } from "graphql-yoga";
import { createServer } from "http";
import mongoose from "mongoose";
import { WebSocketServer } from "ws";
import { schema } from "./graphql";
import { worker } from "./worker";

console.log("Starting app on environment", process.env.ENVIRONMENT);

const provider = new ethers.providers.StaticJsonRpcProvider(
  process.env.JSON_RPC_URL
);

const yoga = createYoga({
  schema,
  graphiql: {
    subscriptionsProtocol: "WS",
  },
});
const httpServer = createServer(yoga);
const wsServer = new WebSocketServer({
  server: httpServer,
  path: yoga.graphqlEndpoint,
});

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

mongoose.set("strictQuery", true);
mongoose
  .connect(`mongodb://${process.env.MONGODB_HOST}:27017/test`)
  .then(() => {
    worker(provider).catch((err) => {
      console.error("Error occured during load :", err);
      mongoose.disconnect();
    });

    httpServer.listen(4000, () =>
      console.log("Running a GraphQL API server at http://localhost:4000/")
    );
  })
  .catch((err) => console.error("Error connecting to database :", err));
