import { AbstractBroker } from "../../core/AbstractBroker";
import { rootLogger } from "../../rootLogger";

const log = rootLogger.child({ name: "health" });

export const HealthQueryResolverFactory = (broker: AbstractBroker) => async () => {
  const subscription = broker.subscribeHealth();
  const result = await subscription.next();
  if (result.done === false) {
    await subscription.return();
  }
  return result.value;
};

export const HealthSubscriptionResolverFactory = (broker: AbstractBroker) => ({
  subscribe: (_: any) => {
    log.debug({
      msg: "client subscribing to health checks",
    });

    return broker.subscribeHealth();
  },
  resolve: (payload: any) => payload,
});
