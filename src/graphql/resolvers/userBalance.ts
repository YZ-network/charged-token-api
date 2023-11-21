import { Repeater } from "graphql-yoga";
import { ChargedTokenModel, UserBalanceModel } from "../../models";
import { rootLogger } from "../../util";
import pubSub from "../pubsub";

const log = rootLogger.child({ name: "userBalance" });

export const UserBalanceQueryResolver = async (
  _: any,
  { chainId, user, address }: { chainId: number; user: string; address?: string },
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
      return (await UserBalanceModel.find({ chainId, user })).map((balance) => UserBalanceModel.toGraphQL(balance));
    }
  }

  log.info({
    msg: "Notifying worker to load balances",
    user,
    chainId,
    address,
  });
  pubSub.publish(`UserBalance.${chainId}/load`, JSON.stringify({ user, address }));

  return [];
};

export const UserBalanceSubscriptionResolver = {
  subscribe: (_: any, { chainId, user }: { chainId: number; user: string }) => {
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
          await push(lastValue.map((value) => UserBalanceModel.toGraphQL(value)));
        }

        for await (const value of sub) {
          log.debug({
            msg: "sending balances to subscription",
            data: value,
            user,
            chainId,
          });
          await push(value);
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
        stop(err);
      }
    });
  },
  resolve: (payload: any) => payload,
};
