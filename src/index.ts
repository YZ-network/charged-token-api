import { ethers } from "ethers";
import { ChargedToken } from "./loaders";
import { Directory } from "./loaders/Directory";

console.log("Starting worker on environment", process.env.ENVIRONMENT);

const provider = new ethers.providers.StaticJsonRpcProvider(
  process.env.JSON_RPC_URL
);

const directory = new Directory(provider, process.env.DIRECTORY_ADDRESS!);

directory
  .load()
  .then((data: Record<string, any>) => {
    console.log("Read directory", data.address, "data :");
    console.log(JSON.stringify(data, null, 2));

    Promise.all(
      Object.values(directory.ct).map((ct: ChargedToken) => ct.load())
    )
      .then((ctList: Record<string, any>[]) =>
        console.log("loaded CT contracts :", JSON.stringify(ctList, null, 2))
      )
      .catch((err) => console.error("Error occured reading CT :", err));
  })
  .catch((err: Error) => {
    console.error("Error reading directory data :", err);
  });
