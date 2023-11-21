import { Repeater } from "graphql-yoga";
import mongoose from "mongoose";
import { IModel } from "../../types";
import { rootLogger } from "../../util";
import pubSub from "../pubsub";

const log = rootLogger.child({ name: "resolverFactory" });

export const ResolverFactory = {
  findAll: <T>(model: IModel<T>) => {
    return async (_: any, { chainId }: { chainId: number }) => {
      const results = await model.find({ chainId });
      return results.map((result) => model.toGraphQL(result));
    };
  },

  findByAddress: <T>(model: IModel<T>) => {
    return async (_: any, { chainId, address }: { chainId: number; address: string }) => {
      const result = await model.findOne({ chainId, address });
      if (result !== null) {
        return model.toGraphQL(result);
      }
    };
  },

  subscribeByName: <T>(modelName: string) => {
    return {
      subscribe: (_: any, { chainId }: { chainId: number }) => {
        const channelName = `${modelName}.${chainId}`;

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
            const model = mongoose.model(modelName) as IModel<T>;
            const lastValue = await model.findOne({ chainId });
            if (lastValue !== null) {
              await push(model.toGraphQL(lastValue));
            }

            for await (const value of sub) {
              await push(value);
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

  subscribeByNameAndAddress: <T>(modelName: string) => {
    return {
      subscribe: (_: any, { chainId, address }: { chainId: number; address: string }) => {
        const channelName = `${modelName}.${chainId}.${address}`;

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
            const model = mongoose.model(modelName) as IModel<T>;
            const lastValue = await model.findOne({ chainId, address });
            if (lastValue !== null) {
              await push(model.toGraphQL(lastValue));
            }

            for await (const value of sub) {
              await push(value);
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
