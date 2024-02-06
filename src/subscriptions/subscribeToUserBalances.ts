import mongoose from "mongoose";
import { AbstractBlockchainRepository } from "../loaders";
import { AbstractBroker } from "../loaders/AbstractBroker";
import { type Directory } from "../loaders/Directory";
import { rootLogger } from "../rootLogger";

const log = rootLogger.child({ name: "subscribeToUserBalancesLoading" });

export async function subscribeToUserBalancesLoading(
  directory: Directory,
  blockchain: AbstractBlockchainRepository,
  broker: AbstractBroker,
): Promise<void> {
  const sub = broker.subscribeBalanceLoadingRequests(directory.chainId);
  log.info({
    msg: `listening to balance update requests for ${directory.chainId}`,
    chainId: directory.chainId,
  });

  for await (const info of sub) {
    const { user, address } = info;
    log.info({
      msg: `Got user balances reload message for ${user}@${address}`,
      chainId: directory.chainId,
    });
    const blockNumber = await blockchain.getBlockNumber();
    try {
      const session = await mongoose.startSession();
      await session.withTransaction(async () => {
        await directory.loadAllUserBalances(session, user, blockNumber, address);
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
