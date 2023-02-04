import { ethers } from "ethers";
import {
  subscribeToNewBlocks,
  subscribeToUserBalancesLoading,
} from "./loaders";
import { Directory } from "./loaders/Directory";

export async function worker(provider: ethers.providers.JsonRpcProvider) {
  const directory = new Directory(provider, process.env.DIRECTORY_ADDRESS!);
  await directory.init();
  subscribeToNewBlocks(provider, directory);
  subscribeToUserBalancesLoading(directory);
  // await mongoose.disconnect();
}
