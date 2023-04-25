import mongoose from "mongoose";
import { pubSub } from "../graphql";
import { Directory } from "../loaders";
import { rootLogger } from "../util";

const log = rootLogger.child({ name: "subscribeToUserBalancesLoading" });

export async function subscribeToUserBalancesLoading(
  directory: Directory
): Promise<void> {
  const channelName = `UserBalance.${directory.chainId}/load`;

  const sub = pubSub.subscribe(`UserBalance.${directory.chainId}/load`);
  log.info(`listening to notifications from channel ${channelName}`);

  for await (const user of sub) {
    log.info(`Got user balances reload message for ${user}`);
    await mongoose
      .startSession()
      .then(async (session) => {
        await session.withTransaction(async () => {
          await directory.loadAllUserBalances(session, user);
        });
        await session.endSession();
      })
      .catch((err) =>
        log.error({ msg: "Error occured within transaction", err })
      );
  }
}

export default subscribeToUserBalancesLoading;
