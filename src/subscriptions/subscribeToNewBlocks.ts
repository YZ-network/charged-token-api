import { ethers } from "ethers";
import { Directory } from "../loaders";
import { rootLogger } from "../util";

const log = rootLogger.child({ name: "subscribeToNewBlocks" });

export function subscribeToNewBlocks(
  provider: ethers.providers.JsonRpcProvider,
  directory: Directory
): void {
  log.info("Subscribing to new blocks notifications");

  provider.on("block", async (newBlockNumber) => {
    if (newBlockNumber >= directory.lastUpdateBlock) {
      log.debug(`got new block : ${newBlockNumber}`);

      const addresses: string[] = [];

      await directory.applyFunc(async (loader) => {
        addresses.push(loader.address);
      });

      const eventFilter: ethers.providers.Filter = {
        fromBlock: directory.lastUpdateBlock + 1,
      };

      try {
        const missedEvents = await provider.getLogs(eventFilter);
        const missedEventsMap: Record<string, ethers.providers.Log[]> = {};

        addresses.forEach((address) => (missedEventsMap[address] = []));

        let eventsCount = 0;
        for (const event of missedEvents) {
          if (!addresses.includes(event.address)) continue;
          missedEventsMap[event.address].push(event);
          eventsCount++;
        }

        if (eventsCount > 0) {
          log.info(`Found ${eventsCount} events for block ${newBlockNumber}`);
        }

        await directory.applyFunc(
          async (loader) =>
            await loader.syncEvents(
              directory.lastUpdateBlock + 1,
              newBlockNumber,
              missedEventsMap[loader.address]
            )
        );
      } catch (err) {
        log.error({
          msg: `Couldn't retrieve logs between block ${
            directory.lastUpdateBlock + 1
          } and ${newBlockNumber}`,
          err,
        });
      }
    } else {
      log.warn(`skipping past block : ${newBlockNumber}`);
    }
  });
}

export default subscribeToNewBlocks;
