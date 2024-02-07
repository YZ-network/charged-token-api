import {
  AbstractBlockchainRepository,
  AbstractDbRepository,
  EMPTY_ADDRESS,
  IChargedToken,
  IInterfaceProjectToken,
} from "../loaders";
import { AbstractBroker } from "../loaders/AbstractBroker";
import { rootLogger } from "../rootLogger";

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
    let addresses: string[] = [];

    if (address !== undefined) {
      addresses.push(address);
    } else {
      const directory = await db.getDirectory(chainId);

      if (directory !== null) {
        addresses = directory.directory;
      }
    }

    await Promise.all(
      addresses.map(async (address) => {
        const lastState = blockchain.getLastState<IChargedToken>(address);
        let interfaceAddress: string | undefined;
        let ptAddress: string | undefined;

        if (lastState !== undefined) {
          if (lastState.interfaceProjectToken !== EMPTY_ADDRESS) {
            interfaceAddress = lastState.interfaceProjectToken;
            const lastInterface = blockchain.getLastState<IInterfaceProjectToken>(interfaceAddress);

            if (lastInterface !== undefined && lastInterface.projectToken !== EMPTY_ADDRESS) {
              ptAddress = lastInterface.projectToken;
            }
          }

          const balance = await blockchain.loadUserBalances(blockNumber, user, address, interfaceAddress, ptAddress);

          await db.saveBalance(balance);
        }
      }),
    );
  }
}

export default subscribeToUserBalancesLoading;
