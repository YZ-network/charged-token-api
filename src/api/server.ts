import { ExecutionArgs, GraphQLError } from "graphql";
import { Context, SubscribeMessage } from "graphql-ws";
import { Extra, useServer } from "graphql-ws/lib/use/ws";
import { YogaServerInstance, createYoga } from "graphql-yoga";
import { Server, createServer } from "http";
import { WebSocketServer } from "ws";
import { Config } from "../config";
import { AbstractBroker } from "../core/AbstractBroker";
import { AbstractDbRepository } from "../core/AbstractDbRepository";
import { eventsExporterFactory } from "./exporter";
import { usePrometheus } from "./prometheus";
import schemaFactory from "./schema";

export function buildCorsHeaders(request: Request) {
  const requestOrigin = request.headers.get("origin") as string;
  return {
    origin: requestOrigin,
    methods: ["POST", "OPTIONS"],
  };
}

export const onSubscribeFactory =
  (yoga: YogaServerInstance<{}, {}>) =>
  async (
    ctx: Context<Record<string, unknown> | undefined, Extra & Partial<Record<PropertyKey, any>>>,
    msg: SubscribeMessage,
  ): Promise<ExecutionArgs | readonly GraphQLError[] | void> => {
    const { schema, execute, subscribe, contextFactory, parse, validate } = yoga.getEnveloped({
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
  };

export function configureApiServer(db: AbstractDbRepository, broker: AbstractBroker): Server {
  const yoga = createYoga({
    schema: schemaFactory(db, broker),
    graphiql: Config.api.enableGraphiql
      ? {
          subscriptionsProtocol: "WS",
        }
      : false,
    cors: buildCorsHeaders,
    plugins: [usePrometheus(), eventsExporterFactory(db)()],
  });

  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  const httpServer = createServer(yoga);
  const wsServer = new WebSocketServer({
    server: httpServer,
    path: yoga.graphqlEndpoint,
  });

  useServer(
    {
      execute: (args: any) => args.rootValue.execute(args),
      subscribe: (args: any) => args.rootValue.subscribe(args),
      onSubscribe: onSubscribeFactory(yoga),
    },
    wsServer,
  );

  return httpServer;
}
