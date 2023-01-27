import { ethers } from "ethers";
import mongoose from "mongoose";
import { worker } from "./worker";

console.log("Starting worker on environment", process.env.ENVIRONMENT);

const provider = new ethers.providers.StaticJsonRpcProvider(
  process.env.JSON_RPC_URL
);

worker(provider).catch((err) => {
  console.error("Error occured during load :", err);
  mongoose.disconnect();
});
