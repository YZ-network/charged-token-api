import { Repeater } from "graphql-yoga";
import { AbstractBlockchainRepository } from "../core/AbstractBlockchainRepository";
import { AbstractBroker } from "../core/AbstractBroker";
import { AbstractDbRepository } from "../core/AbstractDbRepository";
import { rootLogger } from "../rootLogger";
import { EMPTY_ADDRESS, Logger } from "../vendor";

async function listenToBalanceLoadingRequests(
  sub: Repeater<any, any, unknown>,
  db: AbstractDbRepository,
  log: Logger,
  blockchain: AbstractBlockchainRepository,
) {
  for await (const info of sub) {
    const { user, address } = info;
    log.info({
      msg: "Got user balances reload message",
      user,
      address,
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

export async function subscribeToUserBalancesLoading(
  chainId: number,
  db: AbstractDbRepository,
  blockchain: AbstractBlockchainRepository,
  broker: AbstractBroker,
): Promise<void> {
  const log = rootLogger.child({ chainId, name: "BalanceRequests" });

  const sub = broker.subscribeBalanceLoadingRequests(chainId);
  log.info("listening to balance update requests");

  await listenToBalanceLoadingRequests(sub, db, log, blockchain);
}

export default subscribeToUserBalancesLoading;
