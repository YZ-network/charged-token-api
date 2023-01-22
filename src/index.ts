import { ethers } from "ethers";
import { contracts } from "./contracts";

const JSON_RPC_URL = "http://localhost:7545";
const DIRECTORY_ADDRESS = "0x20a0382057CDEB3ECEabA65FA23B86840BDaA659";

const provider = new ethers.providers.JsonRpcProvider(JSON_RPC_URL);

async function loadDirectory(address: string): Promise<Record<string, any>> {
  const directory = new ethers.Contract(
    DIRECTORY_ADDRESS,
    contracts.ContractsDirectory.abi,
    provider
  );

  const data: Record<string, any> = {};

  data["owner"] = await directory.owner();

  const whitelistCount = (
    await directory.countWhitelistedProjectOwners()
  ).toNumber();
  const whitelist = [];
  const projectNames = [];
  for (let i = 0; i < whitelistCount; i++) {
    whitelist.push(await directory.getWhitelistedProjectOwner(i));
    projectNames.push(await directory.getWhitelistedProjectName(i));
  }

  data["whitelist"] = whitelist;

  return data;
}

loadDirectory(DIRECTORY_ADDRESS)
  .then((data: Record<string, any>) => {
    console.log("Read directory", DIRECTORY_ADDRESS, "data :");
    console.log(JSON.stringify(data, null, 2));
  })
  .catch((err: Error) => {
    console.error("Error reading directory data :", err);
  });
