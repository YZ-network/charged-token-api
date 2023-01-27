import { ethers } from "ethers";
import mongoose from "mongoose";
import { ChargedToken } from "./loaders";
import { Directory } from "./loaders/Directory";
import { ChargedTokenData, DirectoryData } from "./models";

console.log("Starting worker on environment", process.env.ENVIRONMENT);

const provider = new ethers.providers.StaticJsonRpcProvider(
  process.env.JSON_RPC_URL
);

const directory = new Directory(provider, process.env.DIRECTORY_ADDRESS!);

async function main() {
  await mongoose.connect("mongodb://localhost:27017/test");

  const dirData: DirectoryData = await directory.load();

  console.log("Read directory", dirData.address, "data :");
  console.log(JSON.stringify(dirData, null, 2));

  console.log("saving it to db");
  await directory.saveOrUpdate(dirData);

  const ctList: ChargedTokenData[] = await Promise.all(
    Object.values(directory.ct).map(async (ct: ChargedToken) => {
      const ctData = await ct.load();
      await ct.saveOrUpdate(ctData);
      return ctData;
    })
  );
  console.log("loaded CT contracts :", JSON.stringify(ctList, null, 2));

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Error occured during load :", err);
  mongoose.disconnect();
});
