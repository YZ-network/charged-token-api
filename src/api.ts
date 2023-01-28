import { createPubSub, createSchema, createYoga } from "graphql-yoga";
import { createServer } from "http";
import mongoose from "mongoose";
import { DirectoryModel, IDirectory } from "./models";

function recordToEntryList(
  record: Record<string, string>
): { key: string; value: string }[] {
  return Object.entries(record).map(([key, value]) => ({
    key,
    value,
  }));
}

const pubSub = createPubSub();

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
  resolvers: {
    Query: {
      Directory: async () => {
        const directory = await DirectoryModel.findOne().exec();

        if (directory === null) {
          throw new Error("No directory yet.");
        }

        const jsonDirectory: IDirectory = directory.toJSON();

        return {
          ...jsonDirectory,
          projectRelatedToLT: recordToEntryList(
            jsonDirectory.projectRelatedToLT
          ),
          whitelist: recordToEntryList(jsonDirectory.projectRelatedToLT),
        };
      },
    },

    Subscription: {
      Directory: {
        subscribe: () => pubSub.subscribe("Directory"),
        resolve: (payload) => payload,
      },
    },
  },
});

const yoga = createYoga({ schema });
const server = createServer(yoga);

async function pushDirUpdatesUsingPubSub() {
  let count = 0;
  const directory = await DirectoryModel.findOne().exec();

  if (directory === null) {
    throw new Error("No directory yet.");
  }

  const jsonDirectory: IDirectory = directory.toJSON();

  setInterval(() => {
    pubSub.publish("Directory", {
      count: count++,
      ...jsonDirectory,
      projectRelatedToLT: recordToEntryList(jsonDirectory.projectRelatedToLT),
      whitelist: recordToEntryList(jsonDirectory.projectRelatedToLT),
    });
  }, 1000);
}

mongoose
  .connect("mongodb://localhost:27017/test")
  .then(() => {
    server.listen(4000, () => {
      console.log("Running a GraphQL API server at http://localhost:4000/");
      pushDirUpdatesUsingPubSub();
    });
  })
  .catch((err) => console.error("Error connecting to database :", err));
