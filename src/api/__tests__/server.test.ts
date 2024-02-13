import { YogaServerInstance } from "graphql-yoga";
import { AbstractBroker } from "../../core/AbstractBroker";
import { AbstractDbRepository } from "../../core/AbstractDbRepository";
import { MockBroker } from "../../core/__mocks__/MockBroker";
import { MockDbRepository } from "../../core/__mocks__/MockDbRepository";
import { buildCorsHeaders, configureApiServer, onSubscribeFactory } from "../server";

jest.unmock("ws");
jest.mock("../../config");
jest.mock("../exporter");
jest.mock("../prometheus");
jest.mock("../schema");

describe("GraphQL API server", () => {
  let db: jest.Mocked<AbstractDbRepository>;
  let broker: jest.Mocked<AbstractBroker>;

  beforeEach(() => {
    db = new MockDbRepository() as jest.Mocked<AbstractDbRepository>;
    broker = new MockBroker() as jest.Mocked<AbstractBroker>;
  });

  it("should connect ws server to graphql api", () => {
    configureApiServer(db, broker);
  });

  it("should build cors headers", () => {
    const request = new Request("http://localhost:4000");
    const origin = "http://localhost:3000";
    request.headers.set("origin", origin);

    const resultHeaders = buildCorsHeaders(request);

    expect(resultHeaders.origin).toBe(origin);
    expect(resultHeaders.methods.length).toBe(2);
    expect(resultHeaders.methods).toContain("POST");
    expect(resultHeaders.methods).toContain("OPTIONS");
  });

  it("should build onSubscribe handler", async () => {
    const ctxValue = {};
    const mockYoga = { getEnveloped: jest.fn() } as unknown as jest.Mocked<YogaServerInstance<{}, {}>>;
    const mockEnvelope = {
      schema: {},
      execute: jest.fn(),
      subscribe: jest.fn(),
      contextFactory: jest.fn(async () => ctxValue),
      parse: jest.fn((x: any) => x),
      validate: jest.fn(() => []),
    };
    mockYoga.getEnveloped.mockReturnValueOnce(mockEnvelope as any);

    const mockCtx = {
      extra: {
        request: {},
        socket: {},
      },
    };

    const mockMsg = {
      payload: {
        query: "james",
        operationName: "condor",
        variables: [],
      },
    };

    const onSubscribe = onSubscribeFactory(mockYoga);

    const args = await onSubscribe(mockCtx as any, mockMsg as any);

    expect(mockYoga.getEnveloped).toBeCalledWith({
      ...mockCtx,
      req: mockCtx.extra.request,
      socket: mockCtx.extra.socket,
      params: mockMsg.payload,
    });
    expect(mockEnvelope.parse).toBeCalledWith(mockMsg.payload.query);
    expect(mockEnvelope.contextFactory).toBeCalled();
    expect(mockEnvelope.validate).toBeCalledWith({}, "james");

    expect(args).toStrictEqual({
      schema: mockEnvelope.schema,
      operationName: mockMsg.payload.operationName,
      document: "james",
      variableValues: [],
      contextValue: ctxValue,
      rootValue: {
        execute: mockEnvelope.execute,
        subscribe: mockEnvelope.subscribe,
      },
    });
  });
});
