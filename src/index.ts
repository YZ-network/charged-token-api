import { ethers } from "ethers";
import mongoose from "mongoose";
import { worker } from "./worker";

console.log("Starting worker on environment", process.env.ENVIRONMENT);

const provider = new ethers.providers.StaticJsonRpcProvider(
  process.env.JSON_RPC_URL
);

mongoose.set("strictQuery", true);
mongoose
  .connect("mongodb://localhost:27017/test")
  .then(() => {
    worker(provider).catch((err) => {
      console.error("Error occured during load :", err);
      mongoose.disconnect();
    });
  })
  .catch((err) => console.error("Error connecting to database :", err));
