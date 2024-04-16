import { Logger } from "pino";
import { AbstractBroker } from "../../core/AbstractBroker";
import { AbstractDbRepository } from "../../core/AbstractDbRepository";
import { DirectoryQueryResolverFactory } from "./directory";
import { EventsCountQueryResolverFactory, EventsQueryResolverFactory } from "./events";
import { ResolverFactory } from "./factory";
import { HealthQueryResolverFactory, HealthSubscriptionResolverFactory } from "./health";
import { UserBalanceQueryResolverFactory, UserBalanceSubscriptionResolverFactory } from "./userBalance";
import { VersionQueryResolver } from "./version";

const resolversFactory = (db: AbstractDbRepository, broker: AbstractBroker, log: Logger) => ({
  Query: {
    version: VersionQueryResolver,
    Directory: DirectoryQueryResolverFactory(db, log.child({ query: "Directory" })),
    allChargedTokens: ResolverFactory.findAll(db, "ChargedToken"),
    ChargedToken: ResolverFactory.findByAddress(db, "ChargedToken"),
    allInterfaceProjectTokens: ResolverFactory.findAll(db, "InterfaceProjectToken"),
    InterfaceProjectToken: ResolverFactory.findByAddress(db, "InterfaceProjectToken"),
    allDelegableToLTs: ResolverFactory.findAll(db, "DelegableToLT"),
    DelegableToLT: ResolverFactory.findByAddress(db, "DelegableToLT"),
    UserBalance: UserBalanceQueryResolverFactory(db, broker, log.child({ query: "UserBalance" })),
    userBalances: UserBalanceQueryResolverFactory(db, broker, log.child({ query: "userBalances" })),
    events: EventsQueryResolverFactory(db),
    countEvents: EventsCountQueryResolverFactory(db),
    health: HealthQueryResolverFactory(broker),
  },
  Subscription: {
    Directory: ResolverFactory.subscribeByName(db, broker, log.child({ subscription: "Directory" }), "Directory"),
    ChargedToken: ResolverFactory.subscribeByNameAndAddress(
      db,
      broker,
      log.child({ subscription: "ChargedToken" }),
      "ChargedToken",
    ),
    InterfaceProjectToken: ResolverFactory.subscribeByNameAndAddress(
      db,
      broker,
      log.child({ subscription: "InterfaceProjectToken" }),
      "InterfaceProjectToken",
    ),
    DelegableToLT: ResolverFactory.subscribeByNameAndAddress(
      db,
      broker,
      log.child({ subscription: "DelegableToLT" }),
      "DelegableToLT",
    ),
    userBalances: UserBalanceSubscriptionResolverFactory(db, broker, log.child({ subscription: "userBalances" })),
    health: HealthSubscriptionResolverFactory(broker, log.child({ subscription: "health" })),
  },
});

export default resolversFactory;
