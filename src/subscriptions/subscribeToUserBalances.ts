import { AbstractBlockchainRepository } from "../core/AbstractBlockchainRepository";
import { AbstractBroker } from "../core/AbstractBroker";
import { AbstractDbRepository } from "../core/AbstractDbRepository";
import { rootLogger } from "../rootLogger";
import { EMPTY_ADDRESS } from "../vendor";

const log = rootLogger.child({ name: "subscribeToUserBalancesLoading" });

export async function subscribeToUserBalancesLoading(
  chainId: number,
  db: AbstractDbRepository,
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

    if (address === undefined) {
      await blockchain.loadAllUserBalances(user, blockNumber);
    } else {
      const lastState = await blockchain.getLastState<IChargedToken>("ChargedToken", address);
      let interfaceAddress: string | undefined;
      let ptAddress: string | undefined;

      if (lastState !== null) {
        if (lastState.interfaceProjectToken !== EMPTY_ADDRESS) {
          interfaceAddress = lastState.interfaceProjectToken;
          const lastInterface = await blockchain.getLastState<IInterfaceProjectToken>(
            "InterfaceProjectToken",
            interfaceAddress,
          );

          if (lastInterface !== null && lastInterface.projectToken !== EMPTY_ADDRESS) {
            ptAddress = lastInterface.projectToken;
          }
        }
      }

      const balance = await blockchain.loadUserBalances(blockNumber, user, address, interfaceAddress, ptAddress);

      await db.saveBalance(balance);
    }
  }
}

export default subscribeToUserBalancesLoading;
