import { ethers } from "ethers";
import { Directory } from "./loaders/Directory";
import { subscribeToUserBalancesLoading } from "./subscriptions";
import { rootLogger } from "./util";

const log = rootLogger.child({ name: "worker" });

export async function worker(
  provider: ethers.providers.JsonRpcProvider,
  directoryAddress: string
) {
  const { chainId, name } = await provider.getNetwork();

  if (directoryAddress === "0x0000000000000000000000000000000000000000") {
    log.warn(`No directory yet on ${name} chainId=${chainId}`);
    return;
  }

  do {
    try {
      log.info(`Starting app on environment ${name} chainId=${chainId}`);

      const directory = new Directory(chainId, provider, directoryAddress);
      await directory.init();
      log.info(
        `Initialization complete for ${name} ${chainId}subscribing to updates`
      );
      directory.subscribeToEvents();
      await subscribeToUserBalancesLoading(directory);
      // await mongoose.disconnect();
    } catch (err) {
      log.error({
        msg: `Error happened killing worker on network ${name} chainId=${chainId}`,
        err,
      });
      await new Promise((resolve) => setTimeout(resolve, 30000));
      log.info("Worker will restart now");
    }
  } while (true);
}
