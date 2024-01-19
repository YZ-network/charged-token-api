import { rootLogger } from "../../util";
import pubSub from "../pubsub";

const log = rootLogger.child({ name: "health" });

export const HealthQueryResolver = async () => {
  const subscription = pubSub.subscribe("Health");
  return await subscription.return();
};

export const HealthSubscriptionResolver = {
  subscribe: (_: any) => {
    log.debug({
      msg: "client subscribing to health checks",
    });

    return pubSub.subscribe("Health");
  },
  resolve: (payload: any) => payload,
};
