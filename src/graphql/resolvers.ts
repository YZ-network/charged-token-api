import { Repeater } from "graphql-yoga";
import {
  ChargedTokenModel,
  DelegableToLTModel,
  DirectoryModel,
  InterfaceProjectTokenModel,
  UserBalanceModel,
} from "../models";
import { IModel } from "../types";
import pubSub from "./pubsub";

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
  console.log("checking existing balances for", chainId, user, address);

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
      console.log("returning cached balances for", user, chainId);
      return (await UserBalanceModel.find({ chainId, user })).map((balance) =>
        UserBalanceModel.toGraphQL(balance)
      );
    }
  }

  console.log("Notifying worker to load balances for", user);
  pubSub.publish(`UserBalance.${chainId}/load`, user);
  const sub = pubSub.subscribe(`UserBalance.${chainId}.${user}`);
  const nextValue = (await sub.next()).value;
  console.log("Received new value :", nextValue);
  const resultsList = JSON.parse(nextValue);
  sub.return();

  if (address !== undefined) {
    return resultsList.find(
      (balanceResult: any) => balanceResult.address === address
    );
  }

  return resultsList;
};

const UserBalanceSubscriptionResolver = {
  subscribe: async (
    _: any,
    { chainId, user }: { chainId: number; user: string }
  ) => {
    console.log("subscribing to balances for", user);
    const sub = pubSub.subscribe(`UserBalance.${chainId}.${user}`);

    return new Repeater(async (push, stop) => {
      stop.then((err) => {
        sub.return();
        console.error("stopped by", err);
      });

      try {
        for await (const value of sub) {
          console.log("sending balances to subscription", value);
          await push(JSON.parse(value));
        }
        console.log("subscription ended");
      } catch (err) {
        console.error("stopped with error", err);
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
        console.log("subscribe to", modelName, chainId);
        const sub = pubSub.subscribe(`${modelName}.${chainId}`);

        return new Repeater(async (push, stop) => {
          stop.then((err) => {
            sub.return();
            console.error("stopped by", err);
          });

          try {
            for await (const value of sub) {
              console.log("sending to subscription");
              await push(value);
            }
            console.log("subscription ended");
          } catch (err) {
            console.error("stopped with error", err);
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
        console.log("subscribe to", modelName, chainId, address);

        const sub = pubSub.subscribe(`${modelName}.${chainId}.${address}`);

        return new Repeater(async (push, stop) => {
          stop.then((err) => {
            sub.return();
            console.error("stopped by", err);
          });

          try {
            for await (const value of sub) {
              console.log("sending to subscription");
              await push(value);
            }
            console.log("subscription ended");
          } catch (err) {
            console.error("stopped with error", err);
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
  },
  Subscription: {
    Directory: ResolverFactory.subscribeByName("Directory"),
    ChargedToken: ResolverFactory.subscribeByNameAndAddress("ChargedToken"),
    InterfaceProjectToken: ResolverFactory.subscribeByNameAndAddress(
      "InterfaceProjectToken"
    ),
    DelegableToLT: ResolverFactory.subscribeByNameAndAddress("DelegableToLT"),
    userBalances: UserBalanceSubscriptionResolver,
  },
};

export default resolvers;
