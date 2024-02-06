import { Repeater } from "graphql-yoga";
import { toGraphQL } from "../../globals";
import { DataType, IContract } from "../../loaders";
import { AbstractDbRepository } from "../../loaders/AbstractDbRepository";
import pubSub from "../../pubsub";
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
    dataType: DataType,
  ) => { subscribe: (_: any, { chainId }: { chainId: number }) => Repeater<T>; resolve: (payload: any) => any };
  subscribeByNameAndAddress: <T>(
    db: AbstractDbRepository,
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

  subscribeByName: <T>(db: AbstractDbRepository, dataType: DataType) => {
    return {
      subscribe: (_: any, { chainId }: { chainId: number }) => {
        const channelName = `${dataType}.${chainId}`;

        log.debug({ msg: `client subscribing to ${channelName}`, chainId });
        const sub = pubSub.subscribe(channelName);

        return new Repeater(async (push, stop) => {
          stop.then((err) => {
            sub.return();
            log.debug({
              msg: `client subscription to ${channelName} stopped by error`,
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
              msg: `client subscription to ${channelName} ended`,
              chainId,
            });
          } catch (err) {
            log.debug({
              msg: `client subscription to ${channelName} stopped with error`,
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

  subscribeByNameAndAddress: <T>(db: AbstractDbRepository, dataType: DataType) => {
    return {
      subscribe: (_: any, { chainId, address }: { chainId: number; address: string }) => {
        const channelName = `${dataType}.${chainId}.${address}`;

        log.debug({ msg: `client subscribing to ${channelName}`, chainId });

        const sub = pubSub.subscribe(channelName);

        return new Repeater(async (push, stop) => {
          stop.then((err) => {
            sub.return();
            log.debug({
              msg: `client subscription to ${channelName} stopped with error`,
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
              msg: `client subscription to ${channelName} ended`,
              chainId,
            });
          } catch (err) {
            log.debug({
              msg: `client subscription to ${channelName} stopped with error`,
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
