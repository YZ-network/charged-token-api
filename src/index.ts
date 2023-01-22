import { ethers } from "ethers";
import { ChargedToken } from "./loaders";
import { Directory } from "./loaders/Directory";

const JSON_RPC_URL = "http://localhost:7545";
const DIRECTORY_ADDRESS = "0x20a0382057CDEB3ECEabA65FA23B86840BDaA659";

const provider = new ethers.providers.JsonRpcProvider(JSON_RPC_URL);

const directory = new Directory(provider, DIRECTORY_ADDRESS);

directory
  .load()
  .then((data: Record<string, any>) => {
    console.log("Read directory", DIRECTORY_ADDRESS, "data :");
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
