import { ethers } from "ethers";
import { Directory } from "./loaders/Directory";
import { subscribeToUserBalancesLoading } from "./subscriptions";

export async function worker(
  provider: ethers.providers.JsonRpcProvider,
  directoryAddress: string
) {
  const { chainId, name } = await provider.getNetwork();

  if (directoryAddress === "0x0000000000000000000000000000000000000000") {
    console.log("No directory yet on", name, "chainId=", chainId);
    return;
  }

  do {
    try {
      console.log("Starting app on environment", name, "chainId=", chainId);

      const directory = new Directory(chainId, provider, directoryAddress);
      await directory.init();
      console.log(
        "Initialization complete for",
        name,
        chainId,
        "subscribing to updates"
      );
      directory.subscribeToEvents();
      await subscribeToUserBalancesLoading(directory);
      // await mongoose.disconnect();
    } catch (err) {
      console.error(
        "Error happened killing worker on network",
        name,
        "chainId=",
        chainId
      );
      await new Promise((resolve) => setTimeout(resolve, 30000));
      console.log("Worker will restart now");
    }
  } while (true);
}
