/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { GraphQLSchema } from "graphql";
import { MockLogger } from "../../__mocks__/MockLogger";
import { MockBroker } from "../../core/__mocks__/MockBroker";
import { MockDbRepository } from "../../core/__mocks__/MockDbRepository";
import { MockWorkerManager } from "../../core/__mocks__/MockWorkerManager";
import schemaFactory from "../schema";

jest.unmock("graphql-yoga");

jest.mock("../resolvers");

describe("GraphQL Schema", () => {
  it("should create schema with all needed queries and subscriptions", () => {
    const schema = schemaFactory(new MockDbRepository(), new MockBroker(), new MockWorkerManager(), new MockLogger());

    expect(schema).toBeInstanceOf(GraphQLSchema);

    const typeMap = schema.getTypeMap();
    expect(typeMap["IEntry"]).toBeDefined();
    expect(typeMap["IOwnable"]).toBeDefined();
    expect(typeMap["IERC20"]).toBeDefined();
    expect(typeMap["IDirectory"]).toBeDefined();
    expect(typeMap["IChargedToken"]).toBeDefined();
    expect(typeMap["IInterfaceProjectToken"]).toBeDefined();
    expect(typeMap["IDelegableToLT"]).toBeDefined();
    expect(typeMap["IUserBalancesEntry"]).toBeDefined();
    expect(typeMap["IWorkerHealth"]).toBeDefined();

    const queries = schema.getQueryType()!.getFields();

    expect(queries).toBeDefined();
    expect(queries["Directory"]).toBeDefined();
    expect(queries["allChargedTokens"]).toBeDefined();
    expect(queries["ChargedToken"]).toBeDefined();
    expect(queries["allInterfaceProjectTokens"]).toBeDefined();
    expect(queries["InterfaceProjectToken"]).toBeDefined();
    expect(queries["allDelegableToLTs"]).toBeDefined();
    expect(queries["DelegableToLT"]).toBeDefined();
    expect(queries["UserBalance"]).toBeDefined();
    expect(queries["userBalances"]).toBeDefined();
    expect(queries["version"]).toBeDefined();
    expect(queries["health"]).toBeDefined();

    const subscriptions = schema.getSubscriptionType()!.getFields();

    expect(subscriptions).toBeDefined();
    expect(subscriptions["Directory"]).toBeDefined();
    expect(subscriptions["ChargedToken"]).toBeDefined();
    expect(subscriptions["InterfaceProjectToken"]).toBeDefined();
    expect(subscriptions["DelegableToLT"]).toBeDefined();
    expect(subscriptions["userBalances"]).toBeDefined();
  });
});
