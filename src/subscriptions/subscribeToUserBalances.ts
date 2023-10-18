import mongoose from 'mongoose';
import { pubSub } from '../graphql';
import { type Directory } from '../loaders';
import { rootLogger } from '../util';

const log = rootLogger.child({ name: 'subscribeToUserBalancesLoading' })

export async function subscribeToUserBalancesLoading (
  directory: Directory
): Promise<void> {
  const channelName = `UserBalance.${directory.chainId}/load`

  const sub = pubSub.subscribe(`UserBalance.${directory.chainId}/load`)
  log.info({
    msg: `listening to notifications from channel ${channelName}`,
    chainId: directory.chainId
  });

  for await (const info of sub) {
    const { user, address } = JSON.parse(info)
    log.info({
      msg: `Got user balances reload message for ${user}@${address}`,
      chainId: directory.chainId
    });
    try {
      const session = await mongoose.startSession()
      await session.withTransaction(async () => {
        await directory.loadAllUserBalances(session, user, address)
      });
      await session.endSession()
    } catch (err) {
      log.error({
        msg: 'Error occured within transaction',
        err,
        chainId: directory.chainId
      });
    }
  }
}

export default subscribeToUserBalancesLoading
