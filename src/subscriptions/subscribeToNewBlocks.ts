import { ethers } from "ethers";
import { Directory } from "../loaders";

export function subscribeToNewBlocks(
  provider: ethers.providers.JsonRpcProvider,
  directory: Directory
): void {
  provider.on("block", async (newBlockNumber) => {
    if (newBlockNumber >= directory.lastUpdateBlock) {
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
          console.log("Events found :", eventsCount);
        }

        await directory.applyFunc((loader) =>
          loader.syncEvents(
            directory.lastUpdateBlock + 1,
            newBlockNumber,
            missedEventsMap[loader.address]
          )
        );
      } catch (e) {
        console.error(
          "Couldn't retrieve logs from block",
          directory.lastUpdateBlock + 1,
          "to",
          newBlockNumber
        );
      }
    } else {
      console.log("skipping past block :", newBlockNumber);
    }
  });
}

export default subscribeToNewBlocks;
