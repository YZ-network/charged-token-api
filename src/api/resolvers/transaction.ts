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
        let tx = await db.getTransaction(chainId, hash);
        if (tx === null) {
          for await (const value of sub) {
            tx = value;
            log.info({ msg: "pushing transaction mined from channel", tx });
            await sub.return();
          }
        } else {
          log.info({ msg: "pushing transaction mined from db", tx });
        }

        await push(tx);
        await stop();
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
