import { ethers } from "ethers";
import { createYoga } from "graphql-yoga";
import mongoose from "mongoose";
import { worker } from "./worker";

import { createServer } from "http";

import { schema } from "./graphql";

console.log("Starting app on environment", process.env.ENVIRONMENT);

const provider = new ethers.providers.StaticJsonRpcProvider(
  process.env.JSON_RPC_URL
);

const yoga = createYoga({ schema });
const server = createServer(yoga);

mongoose.set("strictQuery", true);
mongoose
  .connect("mongodb://localhost:27017/test")
  .then(() => {
    worker(provider).catch((err) => {
      console.error("Error occured during load :", err);
      mongoose.disconnect();
    });

    server.listen(4000, () =>
      console.log("Running a GraphQL API server at http://localhost:4000/")
    );
  })
  .catch((err) => console.error("Error connecting to database :", err));
