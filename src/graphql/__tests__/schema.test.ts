/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { GraphQLSchema } from "graphql";
import { MockDbRepository } from "../../loaders/__mocks__/MockDbRepository";
import schemaFactory from "../schema";

jest.mock("../resolvers");

describe("GraphQL Schema", () => {
  it("should create schema with all needed queries and subscriptions", () => {
    const schema = schemaFactory(new MockDbRepository());

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
    expect(typeMap["IEvent"]).toBeDefined();

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
    expect(queries["events"]).toBeDefined();
    expect(queries["countEvents"]).toBeDefined();
    expect(queries["health"]).toBeDefined();

    const subscriptions = schema.getSubscriptionType()!.getFields();

    expect(subscriptions).toBeDefined();
    expect(subscriptions["Directory"]).toBeDefined();
    expect(subscriptions["ChargedToken"]).toBeDefined();
    expect(subscriptions["InterfaceProjectToken"]).toBeDefined();
    expect(subscriptions["DelegableToLT"]).toBeDefined();
    expect(subscriptions["userBalances"]).toBeDefined();
    expect(subscriptions["health"]).toBeDefined();
  });
});
