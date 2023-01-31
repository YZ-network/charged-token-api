import { ethers } from "ethers";
import { subscribeToNewBlocks } from "./loaders/AbstractLoader";
import { Directory } from "./loaders/Directory";

export async function worker(provider: ethers.providers.JsonRpcProvider) {
  const directory = new Directory(provider, process.env.DIRECTORY_ADDRESS!);
  await directory.init();
  subscribeToNewBlocks(provider, directory);
  // await mongoose.disconnect();
}
