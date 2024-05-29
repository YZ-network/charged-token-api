import { Repeater } from "graphql-yoga";
import type { Logger } from "pino";
import type { AbstractBroker } from "../../core/AbstractBroker";
import type { AbstractDbRepository } from "../../core/AbstractDbRepository";
import { validateChainId } from "./validateChainId";

export const TransactionSubscriptionResolverFactory = (
  db: AbstractDbRepository,
  broker: AbstractBroker,
  log: Logger,
) => ({
  subscribe: (_: any, { chainId, hash }: { chainId: number; hash: string }) => {
    validateChainId(chainId);

    const sub = broker.subscribeTransaction(chainId, hash);

    return new Repeater(async (push, stop) => {
      stop.then(async (err) => {
        await broker.unsubscribe(sub, chainId);
        log.info({
          msg: "transaction subscription stopped",
          chainId,
          hash,
          err,
        });
      });

      try {
        for await (const value of sub) {
          log.info({ msg: "pushing transaction mined from channel", tx: value });
          await push(value);
          await stop();
          await sub.return();
        }
      } catch (err) {
        log.error({
          msg: "transaction subscription stopped with error",
          chainId,
          hash,
          err,
        });
        stop(err);
      }
    });
  },
  resolve: (payload: any) => payload,
});
