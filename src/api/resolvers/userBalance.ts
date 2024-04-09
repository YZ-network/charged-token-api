import { Repeater } from "graphql-yoga";
import { AbstractBroker } from "../../core/AbstractBroker";
import { AbstractDbRepository } from "../../core/AbstractDbRepository";
import { rootLogger } from "../../rootLogger";

const log = rootLogger.child({ name: "userBalance" });

export type UserBalanceQueryResolver = (
  _: any,
  { chainId, user, address }: { chainId: number; user: string; address?: string },
) => Promise<IUserBalance | IUserBalance[]>;

export const UserBalanceQueryResolverFactory =
  (db: AbstractDbRepository, broker: AbstractBroker) =>
  async (_: any, { chainId, user, address }: { chainId: number; user: string; address?: string }) => {
    log.info({ chainId, user, address, msg: "checking existing balances" });

    if (await db.isUserBalancesLoaded(chainId, user)) {
      log.info({ chainId, user, address, msg: "returning cached balances" });

      if (address !== undefined) {
        const balance = await db.getBalance(chainId, address, user);
        return balance !== null ? balance : [];
      }

      return await db.getBalances(chainId, user);
    }

    log.info({
      chainId,
      user,
      address,
      msg: "Notifying worker to load balances",
    });
    broker.notifyBalanceLoadingRequired(chainId, { user, address });

    return [];
  };

export const UserBalanceSubscriptionResolverFactory = (db: AbstractDbRepository, broker: AbstractBroker) => ({
  subscribe: (_: any, { chainId, user }: { chainId: number; user: string }) => {
    const sub = broker.subscribeUpdatesByAddress("UserBalance", chainId, user);

    return new Repeater(async (push, stop) => {
      stop.then((err) => {
        sub.return();
        log.info({
          chainId,
          user,
          msg: "client user balances subscription stopped by",
          err,
        });
      });

      try {
        const lastValue = await db.getBalances(chainId, user);
        if (lastValue.length > 0) {
          await push(lastValue);
        }

        for await (const value of sub) {
          log.info({
            chainId,
            user,
            msg: "sending balances to subscription",
            data: value,
          });
          await push(value);
        }
        log.info({
          chainId,
          user,
          msg: "client user balances subscription ended",
        });
      } catch (err) {
        log.error({
          chainId,
          user,
          msg: "client user balances subscription stopped with error",
          err,
        });
        stop(err);
      }
    });
  },
  resolve: (payload: any) => payload,
});
