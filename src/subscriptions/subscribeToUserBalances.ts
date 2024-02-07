import mongoose from "mongoose";
import { AbstractBlockchainRepository, EMPTY_ADDRESS, IChargedToken, IInterfaceProjectToken } from "../loaders";
import { AbstractBroker } from "../loaders/AbstractBroker";
import { rootLogger } from "../rootLogger";

const log = rootLogger.child({ name: "subscribeToUserBalancesLoading" });

export async function subscribeToUserBalancesLoading(
  chainId: number,
  blockchain: AbstractBlockchainRepository,
  broker: AbstractBroker,
): Promise<void> {
  const sub = broker.subscribeBalanceLoadingRequests(chainId);
  log.info({
    msg: `listening to balance update requests for ${chainId}`,
    chainId,
  });

  for await (const info of sub) {
    const { user, address } = info;
    log.info({
      msg: `Got user balances reload message for ${user}@${address}`,
      chainId,
    });

    const blockNumber = await blockchain.getBlockNumber();

    try {
      const session = await mongoose.startSession();
      await session.withTransaction(async () => {
        const lastState = blockchain.getLastState<IChargedToken>(address);
        let interfaceAddress: string | undefined;
        let ptAddress: string | undefined;

        if (lastState.interfaceProjectToken !== EMPTY_ADDRESS) {
          interfaceAddress = lastState.interfaceProjectToken;
          const lastInterface = blockchain.getLastState<IInterfaceProjectToken>(interfaceAddress);

          if (lastInterface.projectToken !== EMPTY_ADDRESS) {
            ptAddress = lastInterface.projectToken;
          }
        }

        const balances = await blockchain.loadUserBalances(blockNumber, user, address, interfaceAddress, ptAddress);
        // TODO save balances
      });
      await session.endSession();
    } catch (err) {
      log.error({
        msg: "Error occured within transaction",
        err,
        chainId,
      });
    }
  }
}

export default subscribeToUserBalancesLoading;
