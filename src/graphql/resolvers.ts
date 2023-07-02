import { Repeater } from "graphql-yoga";
import mongoose from "mongoose";
import { Main } from "../main";
import {
  ChargedTokenModel,
  DelegableToLTModel,
  DirectoryModel,
  InterfaceProjectTokenModel,
  UserBalanceModel,
} from "../models";
import { EventModel } from "../models/Event";
import { IModel } from "../types";
import { rootLogger } from "../util";
import pubSub from "./pubsub";

const log = rootLogger.child({ name: "resolvers" });

const HealthQueryResolver = () => {
  return Main.health();
};

const HealthSubscriptionResolver = {
  subscribe: (_: any, { pollingMs }: { pollingMs: number }) => {
    log.debug({
      msg: "client subscribing to health checks",
    });

    return new Repeater(async (push, stop) => {
      stop.then((err) => {
        log.warn(`client health check sub stopped by ${err}`);
      });

      push(Main.health());

      setInterval(() => {
        log.debug({ msg: "pushing health status" });
        push(Main.health());
      }, pollingMs);
    });
  },
  resolve: (payload: any) => payload,
};

const DirectoryQueryResolver = async (
  _: any,
  { chainId }: { chainId: number }
) => {
  const directory = await DirectoryModel.findOne({ chainId });

  if (directory === null) {
    return null;
  }

  return DirectoryModel.toGraphQL(directory);
};

const UserBalanceQueryResolver = async (
  _: any,
  {
    chainId,
    user,
    address,
  }: { chainId: number; user: string; address?: string }
) => {
  log.debug({ msg: "checking existing balances", chainId, user, address });

  if (address !== undefined) {
    if ((await UserBalanceModel.exists({ chainId, user, address })) !== null) {
      const balance = await UserBalanceModel.findOne({
        chainId,
        user,
        address,
      });
      return UserBalanceModel.toGraphQL(balance!);
    }
  } else {
    const contractsCount = await ChargedTokenModel.count({ chainId });
    const balancesCount = await UserBalanceModel.count({ chainId, user });

    if (contractsCount === balancesCount) {
      log.debug(`returning cached balances for ${chainId} ${user}`);
      return (await UserBalanceModel.find({ chainId, user })).map((balance) =>
        UserBalanceModel.toGraphQL(balance)
      );
    }
  }

  log.info({
    msg: "Notifying worker to load balances",
    user,
    chainId,
    address,
  });
  pubSub.publish(`UserBalance.${chainId}/load`, user);

  return [];
};

const UserBalanceSubscriptionResolver = {
  subscribe: async (
    _: any,
    { chainId, user }: { chainId: number; user: string }
  ) => {
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
        const lastValue = await UserBalanceModel.find({ chainId, user });
        if (lastValue !== null) {
          await push(
            lastValue.map((value) => UserBalanceModel.toGraphQL(value))
          );
        }

        for await (const value of sub) {
          log.debug({
            msg: "sending balances to subscription",
            data: value,
            user,
            chainId,
          });
          await push(JSON.parse(value));
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
        stop("sub closed");
      }
    });
  },
  resolve: (payload: any) => payload,
};

const EventsQueryResolver = async (
  _: any,
  {
    chainId,
    offset,
    count,
  }: { chainId: number; offset?: number; count?: number }
) => {
  if (offset === undefined) offset = 0;
  if (count === undefined) count = 20;

  const events = await EventModel.find({ chainId })
    .limit(count)
    .skip(offset)
    .sort({ blockNumber: "desc", txIndex: "desc", logIndex: "desc" });

  return events.map((event) => EventModel.toGraphQL(event));
};

class ResolverFactory {
  static findAll<T>(model: IModel<T>) {
    return async (_: any, { chainId }: { chainId: number }) => {
      const results = await model.find({ chainId });
      return results.map((result) => model.toGraphQL(result));
    };
  }

  static findByAddress<T>(model: IModel<T>) {
    return async (
      _: any,
      { chainId, address }: { chainId: number; address: string }
    ) => {
      const result = await model.findOne({ chainId, address });
      if (result !== null) {
        return model.toGraphQL(result);
      }
    };
  }

  static subscribeByName<T>(modelName: string) {
    return {
      subscribe: async (_: any, { chainId }: { chainId: number }) => {
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
            stop("sub closed");
          }
        });
      },
      resolve: (payload: any) => payload,
    };
  }

  static subscribeByNameAndAddress<T>(modelName: string) {
    return {
      subscribe: async (
        _: any,
        { chainId, address }: { chainId: number; address: string }
      ) => {
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
  }
}

const resolvers = {
  Query: {
    Directory: DirectoryQueryResolver,
    allChargedTokens: ResolverFactory.findAll(ChargedTokenModel),
    ChargedToken: ResolverFactory.findByAddress(ChargedTokenModel),
    allInterfaceProjectTokens: ResolverFactory.findAll(
      InterfaceProjectTokenModel
    ),
    InterfaceProjectToken: ResolverFactory.findByAddress(
      InterfaceProjectTokenModel
    ),
    allDelegableToLTs: ResolverFactory.findAll(DelegableToLTModel),
    DelegableToLT: ResolverFactory.findByAddress(DelegableToLTModel),
    UserBalance: UserBalanceQueryResolver,
    userBalances: UserBalanceQueryResolver,
    events: EventsQueryResolver,
    health: HealthQueryResolver,
  },
  Subscription: {
    Directory: ResolverFactory.subscribeByName("Directory"),
    ChargedToken: ResolverFactory.subscribeByNameAndAddress("ChargedToken"),
    InterfaceProjectToken: ResolverFactory.subscribeByNameAndAddress(
      "InterfaceProjectToken"
    ),
    DelegableToLT: ResolverFactory.subscribeByNameAndAddress("DelegableToLT"),
    userBalances: UserBalanceSubscriptionResolver,
    health: HealthSubscriptionResolver,
  },
};

export default resolvers;
