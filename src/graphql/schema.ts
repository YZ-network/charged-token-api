import { createSchema } from "graphql-yoga";

import resolvers from "./resolvers";

const schema = createSchema({
  typeDefs: `
  type IEntry {
    key: String!
    value: String!
  }

  interface IOwnable {
    address: String!
    owner: String!
  }

  type IDirectory implements IOwnable {
    count: Int
    address: String!
    owner: String!
    directory: [String!]!
    whitelistedProjectOwners: [String!]!
    projects: [String!]!
    projectRelatedToLT: [IEntry!]!
    whitelist: [IEntry!]!
    areUserFunctionsDisabled: Boolean!
  }

  type Query {
    Directory: IDirectory
  }

  type Subscription {
    Directory: IDirectory
  }
`,
  resolvers,
});

export default schema;
