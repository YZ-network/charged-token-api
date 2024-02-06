import { Repeater } from "graphql-yoga";
import { toGraphQL } from "../../globals";
import { DataType, IContract } from "../../loaders";
import { AbstractBroker } from "../../loaders/AbstractBroker";
import { AbstractDbRepository } from "../../loaders/AbstractDbRepository";
import { rootLogger } from "../../rootLogger";

const log = rootLogger.child({ name: "resolverFactory" });

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

  subscribeByName: <T>(db: AbstractDbRepository, broker: AbstractBroker, dataType: DataType) => {
    return {
      subscribe: (_: any, { chainId }: { chainId: number }) => {
        const sub = broker.subscribeUpdates(dataType, chainId);

        return new Repeater(async (push, stop) => {
          stop.then((err) => {
            sub.return();
            log.debug({
              msg: `client subscription to ${dataType} ${chainId} stopped by error`,
              err,
              chainId,
            });
          });

          try {
            const lastValue = await db.getAllMatching(dataType, { chainId });
            if (lastValue !== null) {
              await push(toGraphQL(lastValue));
            }

            for await (const value of sub) {
              await push(toGraphQL(value));
            }
            log.debug({
              msg: `client subscription to ${dataType} ${chainId} ended`,
              chainId,
            });
          } catch (err) {
            log.debug({
              msg: `client subscription to ${dataType} ${chainId} stopped with error`,
              err,
              chainId,
            });
            stop(err);
          }
        });
      },
      resolve: (payload: any) => payload,
    };
  },

  subscribeByNameAndAddress: <T>(db: AbstractDbRepository, broker: AbstractBroker, dataType: DataType) => {
    return {
      subscribe: (_: any, { chainId, address }: { chainId: number; address: string }) => {
        const sub = broker.subscribeUpdatesByAddress(dataType, chainId, address);

        return new Repeater(async (push, stop) => {
          stop.then((err) => {
            sub.return();
            log.debug({
              msg: `client subscription to ${dataType} ${chainId} ${address} stopped with error`,
              err,
              chainId,
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
              msg: `client subscription to ${dataType} ${chainId} ${address} ended`,
              chainId,
            });
          } catch (err) {
            log.debug({
              msg: `client subscription to ${dataType} ${chainId} ${address} stopped with error`,
              err,
              chainId,
            });
            stop("sub closed");
          }
        });
      },
      resolve: (payload: any) => payload,
    };
  },
};
