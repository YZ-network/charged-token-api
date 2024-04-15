import { Logger } from "pino";
import { AbstractBroker } from "../../core/AbstractBroker";

export const HealthQueryResolverFactory = (broker: AbstractBroker) => async () => {
  const subscription = broker.subscribeHealth();
  const result = await subscription.next();
  if (result.done === false) {
    await subscription.return();
  }
  return result.value;
};

export const HealthSubscriptionResolverFactory = (broker: AbstractBroker, log: Logger) => ({
  subscribe: (_: any) => {
    log.debug("client subscribing to health checks");

    return broker.subscribeHealth();
  },
  resolve: (payload: any) => payload,
});
