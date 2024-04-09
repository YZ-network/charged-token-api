import { AbstractBroker } from "../../core/AbstractBroker";
import { AbstractDbRepository } from "../../core/AbstractDbRepository";
import { DirectoryQueryResolverFactory } from "./directory";
import { EventsCountQueryResolverFactory, EventsQueryResolverFactory } from "./events";
import { ResolverFactory } from "./factory";
import { HealthQueryResolverFactory, HealthSubscriptionResolverFactory } from "./health";
import { UserBalanceQueryResolverFactory, UserBalanceSubscriptionResolverFactory } from "./userBalance";
import { VersionQueryResolver } from "./version";

const resolversFactory = (db: AbstractDbRepository, broker: AbstractBroker) => ({
  Query: {
    version: VersionQueryResolver,
    Directory: DirectoryQueryResolverFactory(db),
    allChargedTokens: ResolverFactory.findAll(db, "ChargedToken"),
    ChargedToken: ResolverFactory.findByAddress(db, "ChargedToken"),
    allInterfaceProjectTokens: ResolverFactory.findAll(db, "InterfaceProjectToken"),
    InterfaceProjectToken: ResolverFactory.findByAddress(db, "InterfaceProjectToken"),
    allDelegableToLTs: ResolverFactory.findAll(db, "DelegableToLT"),
    DelegableToLT: ResolverFactory.findByAddress(db, "DelegableToLT"),
    UserBalance: UserBalanceQueryResolverFactory(db, broker),
    userBalances: UserBalanceQueryResolverFactory(db, broker),
    events: EventsQueryResolverFactory(db),
    countEvents: EventsCountQueryResolverFactory(db),
    health: HealthQueryResolverFactory(broker),
  },
  Subscription: {
    Directory: ResolverFactory.subscribeByName(db, broker, "Directory"),
    ChargedToken: ResolverFactory.subscribeByNameAndAddress(db, broker, "ChargedToken"),
    InterfaceProjectToken: ResolverFactory.subscribeByNameAndAddress(db, broker, "InterfaceProjectToken"),
    DelegableToLT: ResolverFactory.subscribeByNameAndAddress(db, broker, "DelegableToLT"),
    userBalances: UserBalanceSubscriptionResolverFactory(db, broker),
    health: HealthSubscriptionResolverFactory(broker),
  },
});

export default resolversFactory;
