import { Repeater } from "graphql-yoga";
import { Main } from "../main";
import {
  ChargedTokenModel,
  DelegableToLTModel,
  DirectoryModel,
  InterfaceProjectTokenModel,
  UserBalanceModel,
} from "../models";
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
  log.debug(`checking existing balances for ${chainId} ${user} on ${address}`);

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

  log.info(`Notifying worker to load balances for ${user}`);
  pubSub.publish(`UserBalance.${chainId}/load`, user);

  return [];
};

const UserBalanceSubscriptionResolver = {
  subscribe: async (
    _: any,
    { chainId, user }: { chainId: number; user: string }
  ) => {
    log.debug(`client subscribing to balances for : ${user}`);
    const sub = pubSub.subscribe(`UserBalance.${chainId}.${user}`);

    return new Repeater(async (push, stop) => {
      stop.then((err) => {
        sub.return();
        log.debug(`client user balances subscription stopped by ${err}`);
      });

      try {
        for await (const value of sub) {
          log.debug({ msg: "sending balances to subscription", data: value });
          await push(JSON.parse(value));
        }
        log.debug("client user balances subscription ended");
      } catch (err) {
        log.debug({
          msg: "client user balances subscription stopped with error",
          err,
        });
        stop("sub closed");
      }
    });
  },
  resolve: (payload: any) => payload,
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

  static subscribeByName(modelName: string) {
    return {
      subscribe: async (_: any, { chainId }: { chainId: number }) => {
        const channelName = `${modelName}.${chainId}`;

        log.debug(`client subscribing to ${channelName}`);
        const sub = pubSub.subscribe(channelName);

        return new Repeater(async (push, stop) => {
          stop.then((err) => {
            sub.return();
            log.debug({
              msg: `client subscription to ${channelName} stopped by error`,
              err,
            });
          });

          try {
            for await (const value of sub) {
              await push(value);
            }
            log.debug(`client subscription to ${channelName} ended`);
          } catch (err) {
            log.debug({
              msg: `client subscription to ${channelName} stopped with error`,
              err,
            });
            stop("sub closed");
          }
        });
      },
      resolve: (payload: any) => payload,
    };
  }

  static subscribeByNameAndAddress(modelName: string) {
    return {
      subscribe: async (
        _: any,
        { chainId, address }: { chainId: number; address: string }
      ) => {
        const channelName = `${modelName}.${chainId}.${address}`;

        log.debug(`client subscribing to ${channelName}`);

        const sub = pubSub.subscribe(channelName);

        return new Repeater(async (push, stop) => {
          stop.then((err) => {
            sub.return();
            log.debug({
              msg: `client subscription to ${channelName} stopped with error`,
              err,
            });
          });

          try {
            for await (const value of sub) {
              await push(value);
            }
            log.debug(`client subscription to ${channelName} ended`);
          } catch (err) {
            log.debug({
              msg: `client subscription to ${channelName} stopped with error`,
              err,
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
