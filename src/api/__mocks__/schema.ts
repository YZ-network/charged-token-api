import { createSchema } from "graphql-yoga";

const schemaFactory = jest.fn(() =>
  createSchema({
    typeDefs: `
  type Query {
    hello: String
  }
  `,
    resolvers: {
      Query: {
        hello: jest.fn(),
      },
    },
  }),
);

export default schemaFactory;
