import { ethers } from "ethers";
import {
  subscribeToNewBlocks,
  subscribeToUserBalancesLoading,
} from "./loaders";
import { Directory } from "./loaders/Directory";

export async function worker(
  provider: ethers.providers.JsonRpcProvider,
  directoryAddress: string
) {
  const chainId = await (await provider.getNetwork()).chainId;
  const directory = new Directory(chainId, provider, directoryAddress);
  await directory.init();
  subscribeToNewBlocks(provider, directory);
  subscribeToUserBalancesLoading(directory);
  // await mongoose.disconnect();
}
