import { Repeater } from "graphql-yoga";
import { Logger } from "pino";
import { AbstractBroker } from "../../core/AbstractBroker";
import { AbstractDbRepository } from "../../core/AbstractDbRepository";
import { toGraphQL } from "./functions";

export interface ResolverFactory {
  findAll: (
    db: AbstractDbRepository,
    dataType: DataType,
  ) => (_: any, { chainId }: { chainId: number }) => Promise<any[]>;
  findByAddress: (
    db: AbstractDbRepository,
    dataType: DataType,
  ) => (_: any, { chainId, address }: { chainId: number; address: string }) => Promise<any>;
  subscribeByName: <T>(
    db: AbstractDbRepository,
    broker: AbstractBroker,
    dataType: DataType,
  ) => { subscribe: (_: any, { chainId }: { chainId: number }) => Repeater<T>; resolve: (payload: any) => any };
  subscribeByNameAndAddress: <T>(
    db: AbstractDbRepository,
    broker: AbstractBroker,
    dataType: DataType,
  ) => {
    subscribe: (_: any, { chainId, address }: { chainId: number; address: string }) => Repeater<T>;
    resolve: (payload: any) => any;
  };
}

export const ResolverFactory = {
  findAll: (db: AbstractDbRepository, dataType: DataType) => {
    return async (_: any, { chainId }: { chainId: number }) => {
      const results = await db.getAllMatching(dataType, { chainId });
      return results;
    };
  },

  findByAddress: (db: AbstractDbRepository, dataType: DataType) => {
    return async (_: any, { chainId, address }: { chainId: number; address: string }) => {
      const result = await db.get(dataType, chainId, address);
      if (result !== null) {
        return result;
      }
    };
  },

  subscribeByName: <T>(db: AbstractDbRepository, broker: AbstractBroker, log: Logger, dataType: DataType) => {
    return {
      subscribe: (_: any, { chainId }: { chainId: number }) => {
        const sub = broker.subscribeUpdates(dataType, chainId);

        return new Repeater(async (push, stop) => {
          stop.then(async (err) => {
            await broker.unsubscribe(sub);
            log.debug({
              msg: "client subscription stopped by error",
              chainId,
              dataType,
              err,
            });
          });

          try {
            const lastValue = await db.getAllMatching(dataType, { chainId });
            if (lastValue !== null && lastValue.length > 0) {
              await push(toGraphQL(lastValue[0]));
            }

            for await (const value of sub) {
              await push(toGraphQL(value));
            }
            log.debug({
              msg: "client subscription ended",
              chainId,
              dataType,
            });
          } catch (err) {
            log.debug({
              msg: "client subscription stopped with error",
              chainId,
              dataType,
              err,
            });
            stop(err);
          }
        });
      },
      resolve: (payload: any) => payload,
    };
  },

  subscribeByNameAndAddress: <T>(db: AbstractDbRepository, broker: AbstractBroker, log: Logger, dataType: DataType) => {
    return {
      subscribe: (_: any, { chainId, address }: { chainId: number; address: string }) => {
        const sub = broker.subscribeUpdatesByAddress(dataType, chainId, address);

        return new Repeater(async (push, stop) => {
          stop.then(async (err) => {
            await broker.unsubscribe(sub);
            log.debug({
              msg: "client subscription stopped with error",
              chainId,
              dataType,
              address,
              err,
            });
          });

          try {
            const lastValue = await db.get<IContract>(dataType, chainId, address);
            if (lastValue !== null) {
              await push(toGraphQL(lastValue));
            }

            for await (const value of sub) {
              await push(toGraphQL(value));
            }
            log.debug({
              msg: "client subscription ended",
              chainId,
              dataType,
              address,
            });
          } catch (err) {
            log.debug({
              msg: "client subscription stopped with error",
              chainId,
              dataType,
              address,
              err,
            });
            stop("sub closed");
          }
        });
      },
      resolve: (payload: any) => payload,
    };
  },
};
