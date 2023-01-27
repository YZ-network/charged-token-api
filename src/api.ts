import express from "express";
import { graphqlHTTP } from "express-graphql";
import { buildSchema } from "graphql";
import mongoose from "mongoose";
import { DirectoryModel, IDirectory } from "./models";

const schema = buildSchema(`
  type IEntry {
    key: String!
    value: String!
  }

  interface IOwnable {
    address: String!
    owner: String!
  }

  type IDirectory implements IOwnable {
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
`);

function recordToEntryList(
  record: Record<string, string>
): { key: string; value: string }[] {
  return Object.entries(record).map(([key, value]) => ({
    key,
    value,
  }));
}

const rootValue = {
  Directory: async () => {
    const directory = await DirectoryModel.findOne().exec();

    if (directory === null) {
      throw new Error("No directory yet.");
    }

    const jsonDirectory: IDirectory = directory.toJSON();

    return {
      ...jsonDirectory,
      projectRelatedToLT: recordToEntryList(jsonDirectory.projectRelatedToLT),
      whitelist: recordToEntryList(jsonDirectory.projectRelatedToLT),
    };
  },
};

const app = express();
app.use(
  "/",
  graphqlHTTP({
    schema,
    rootValue,
    graphiql: true,
  })
);

mongoose
  .connect("mongodb://localhost:27017/test")
  .then(() => {
    app.listen(4000);
  })
  .catch((err) => console.error("Error connecting to database :", err));

console.log("Running a GraphQL API server at http://localhost:4000/");
