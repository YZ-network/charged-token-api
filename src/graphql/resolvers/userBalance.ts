import { Repeater } from "graphql-yoga";
import { AbstractBroker } from "../../loaders/AbstractBroker";
import { AbstractDbRepository } from "../../loaders/AbstractDbRepository";
import { DataType, IUserBalance } from "../../loaders/types";
import { rootLogger } from "../../rootLogger";

const log = rootLogger.child({ name: "userBalance" });

export type UserBalanceQueryResolver = (
  _: any,
  { chainId, user, address }: { chainId: number; user: string; address?: string },
) => Promise<IUserBalance | IUserBalance[]>;

export const UserBalanceQueryResolverFactory =
  (db: AbstractDbRepository, broker: AbstractBroker) =>
  async (_: any, { chainId, user, address }: { chainId: number; user: string; address?: string }) => {
    log.debug({ msg: "checking existing balances", chainId, user, address });

    if (address !== undefined) {
      return await db.getBalance(chainId, address, user);
    }

    if (await db.isUserBalancesLoaded(chainId, user)) {
      log.debug(`returning cached balances for ${chainId} ${user}`);
      return await db.getBalances(chainId, user);
    }

    log.info({
      msg: "Notifying worker to load balances",
      user,
      chainId,
      address,
    });
    broker.notifyBalanceLoadingRequired(chainId, { user, address });

    return [];
  };

export const UserBalanceSubscriptionResolverFactory = (db: AbstractDbRepository, broker: AbstractBroker) => ({
  subscribe: (_: any, { chainId, user }: { chainId: number; user: string }) => {
    const sub = broker.subscribeUpdatesByAddress(DataType.UserBalance, chainId, user);

    return new Repeater(async (push, stop) => {
      stop.then((err) => {
        sub.return();
        log.debug({
          msg: "client user balances subscription stopped by",
          err,
          user,
          chainId,
        });
      });

      try {
        const lastValue = await db.getBalances(chainId, user);
        if (lastValue.length > 0) {
          await push(lastValue);
        }

        for await (const value of sub) {
          log.debug({
            msg: "sending balances to subscription",
            data: value,
            user,
            chainId,
          });
          await push(value);
        }
        log.debug({
          msg: "client user balances subscription ended",
          user,
          chainId,
        });
      } catch (err) {
        log.debug({
          msg: "client user balances subscription stopped with error",
          err,
          user,
          chainId,
        });
        stop(err);
      }
    });
  },
  resolve: (payload: any) => payload,
});
