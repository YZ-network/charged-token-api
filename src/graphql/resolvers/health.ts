import { Repeater } from "graphql-yoga";
import { Main } from "../../main";
import { rootLogger } from "../../util";

const log = rootLogger.child({ name: "health" });

export const HealthQueryResolver = () => {
  return Main.health();
};

export const HealthSubscriptionResolver = {
  subscribe: (_: any, { pollingMs }: { pollingMs: number }) => {
    log.debug({
      msg: "client subscribing to health checks",
    });

    return new Repeater(async (push, stop) => {
      push(Main.health());

      const timer = setInterval(() => {
        log.debug({ msg: "pushing health status" });
        push(Main.health());
      }, pollingMs);

      stop.then((err) => {
        log.warn(`client health check sub stopped by ${err}`);
        clearInterval(timer);
      });
    });
  },
  resolve: (payload: any) => payload,
};
