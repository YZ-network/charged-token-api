import { createYoga } from "graphql-yoga";
import { createServer } from "http";
import mongoose from "mongoose";
import { schema } from "./graphql";

const yoga = createYoga({ schema });
const server = createServer(yoga);

mongoose
  .connect("mongodb://localhost:27017/test")
  .then(() => {
    server.listen(4000, () =>
      console.log("Running a GraphQL API server at http://localhost:4000/")
    );
  })
  .catch((err) => console.error("Error connecting to database :", err));
