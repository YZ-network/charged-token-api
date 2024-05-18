import type { ExecutionArgs, GraphQLError } from "graphql";
import type { Context, SubscribeMessage } from "graphql-ws";
import type { Extra} from "graphql-ws/lib/use/ws";
import { useServer } from "graphql-ws/lib/use/ws";
import type { YogaServerInstance} from "graphql-yoga";
import { createYoga, maskError } from "graphql-yoga";
import type { Server} from "http";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { Config } from "../config";
import type { AbstractBroker } from "../core/AbstractBroker";
import type { AbstractDbRepository } from "../core/AbstractDbRepository";
import type { AbstractWorkerManager } from "../core/AbstractWorkerManager";
import { rootLogger } from "../rootLogger";
import { usePrometheus } from "./prometheus";
import schemaFactory from "./schema";

export function buildCorsHeaders(request: Request): { origin: string; methods: string[] } {
  const requestOrigin = request.headers.get("origin") as string;
  return {
    origin: requestOrigin,
    methods: ["POST", "OPTIONS"],
  };
}

export const onSubscribeFactory =
  (yoga: YogaServerInstance<object, object>) =>
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

const apiLogger = rootLogger.child({ name: "Api" }, { msgPrefix: "[GQL] " });

export function configureApiServer(
  db: AbstractDbRepository,
  broker: AbstractBroker,
  workerManager: AbstractWorkerManager,
): Server {
  const yoga = createYoga({
    schema: schemaFactory(db, broker, workerManager, apiLogger),
    graphiql: Config.api.enableGraphiql
      ? {
          subscriptionsProtocol: "WS",
        }
      : false,
    cors: buildCorsHeaders,
    plugins: [usePrometheus()],
    maskedErrors: {
      maskError(error: unknown, message: string, isDev: boolean | undefined) {
        apiLogger.error({ msg: message, error, isDev });
        return maskError(error, message, isDev);
      },
    },
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
