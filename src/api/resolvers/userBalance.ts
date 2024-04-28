import { Repeater } from "graphql-yoga";
import { Logger } from "pino";
import { AbstractBroker } from "../../core/AbstractBroker";
import { AbstractDbRepository } from "../../core/AbstractDbRepository";
import { validateChainId } from "./validateChainId";

export type UserBalanceQueryResolver = (
  _: any,
  { chainId, user, address }: { chainId: number; user: string; address?: string },
) => Promise<IUserBalance | IUserBalance[]>;

export const UserBalanceQueryResolverFactory =
  (db: AbstractDbRepository, broker: AbstractBroker, log: Logger) =>
  async (_: any, { chainId, user, address }: { chainId: number; user: string; address?: string }) => {
    validateChainId(chainId);

    log.info({ msg: "checking existing balances", chainId, user, address });

    if (await db.isUserBalancesLoaded(chainId, user)) {
      log.info({ msg: "returning cached balances", chainId, user, address });

      if (address !== undefined) {
        const balance = await db.getBalance(chainId, address, user);
        return balance !== null ? balance : [];
      }

      return await db.getBalances(chainId, user);
    }

    log.info({
      msg: "Notifying worker to load balances",
      chainId,
      user,
      address,
    });
    broker.notifyBalanceLoadingRequired(chainId, { user, address });

    return [];
  };

export const UserBalanceSubscriptionResolverFactory = (
  db: AbstractDbRepository,
  broker: AbstractBroker,
  log: Logger,
) => ({
  subscribe: (_: any, { chainId, user }: { chainId: number; user: string }) => {
    validateChainId(chainId);

    const sub = broker.subscribeUpdatesByAddress("UserBalance", chainId, user);

    return new Repeater(async (push, stop) => {
      stop.then(async (err) => {
        await broker.unsubscribe(sub, chainId);
        log.info({
          msg: "client user balances subscription stopped by",
          chainId,
          user,
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
            msg: "sending balances to subscription",
            chainId,
            user,
            data: value,
          });
          await push(value);
        }
        log.info({
          msg: "client user balances subscription ended",
          chainId,
          user,
        });
      } catch (err) {
        log.error({
          msg: "client user balances subscription stopped with error",
          chainId,
          user,
          err,
        });
        stop(err);
      }
    });
  },
  resolve: (payload: any) => payload,
});
