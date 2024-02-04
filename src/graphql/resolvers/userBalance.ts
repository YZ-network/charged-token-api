import { Repeater } from "graphql-yoga";
import { AbstractDbRepository } from "../../loaders/AbstractDbRepository";
import { IUserBalance } from "../../models";
import { rootLogger } from "../../util";
import pubSub from "../pubsub";

const log = rootLogger.child({ name: "userBalance" });

export type UserBalanceQueryResolver = (
  _: any,
  { chainId, user, address }: { chainId: number; user: string; address?: string },
) => Promise<IUserBalance | IUserBalance[]>;

export const UserBalanceQueryResolverFactory =
  (db: AbstractDbRepository) =>
  async (_: any, { chainId, user, address }: { chainId: number; user: string; address?: string }) => {
    log.debug({ msg: "checking existing balances", chainId, user, address });

    if (address !== undefined) {
      if (await db.existsBalance(chainId, address, user)) {
        const balance = await db.getBalance(chainId, address, user);
        return balance!; //TODO convert to graphql
      }
    } else if (await db.isUserBalancesLoaded(chainId, user)) {
      log.debug(`returning cached balances for ${chainId} ${user}`);
      return await db.getBalances(chainId, user); // TODO convert to graphql
    }

    log.info({
      msg: "Notifying worker to load balances",
      user,
      chainId,
      address,
    });
    pubSub.publish(`UserBalance.${chainId}/load`, { user, address });

    return [];
  };

export const UserBalanceSubscriptionResolverFactory = (db: AbstractDbRepository) => ({
  subscribe: (_: any, { chainId, user }: { chainId: number; user: string }) => {
    log.debug({ msg: "client subscribing to balances", user, chainId });
    const sub = pubSub.subscribe(`UserBalance.${chainId}.${user}`);

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
          await push(lastValue); // TODO convert to graphql
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
