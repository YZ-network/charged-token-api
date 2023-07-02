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
  log.info({
    msg: `listening to notifications from channel ${channelName}`,
    chainId: directory.chainId,
  });

  for await (const user of sub) {
    log.info({
      msg: `Got user balances reload message for ${user}`,
      chainId: directory.chainId,
    });
    try {
      const session = await mongoose.startSession();
      await session.withTransaction(async () => {
        await directory.loadAllUserBalances(session, user);
      });
      await session.endSession();
    } catch (err) {
      log.error({
        msg: "Error occured within transaction",
        err,
        chainId: directory.chainId,
      });
    }
  }
}

export default subscribeToUserBalancesLoading;
