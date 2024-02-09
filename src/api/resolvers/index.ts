import { AbstractBroker } from "../../core/AbstractBroker";
import { AbstractDbRepository } from "../../core/AbstractDbRepository";
import { DataType } from "../../core/types";
import { DirectoryQueryResolverFactory } from "./directory";
import { EventsCountQueryResolverFactory, EventsQueryResolverFactory } from "./events";
import { ResolverFactory } from "./factory";
import { HealthQueryResolverFactory, HealthSubscriptionResolverFactory } from "./health";
import { UserBalanceQueryResolverFactory, UserBalanceSubscriptionResolverFactory } from "./userBalance";

const resolversFactory = (db: AbstractDbRepository, broker: AbstractBroker) => ({
  Query: {
    Directory: DirectoryQueryResolverFactory(db),
    allChargedTokens: ResolverFactory.findAll(db, DataType.ChargedToken),
    ChargedToken: ResolverFactory.findByAddress(db, DataType.ChargedToken),
    allInterfaceProjectTokens: ResolverFactory.findAll(db, DataType.InterfaceProjectToken),
    InterfaceProjectToken: ResolverFactory.findByAddress(db, DataType.InterfaceProjectToken),
    allDelegableToLTs: ResolverFactory.findAll(db, DataType.DelegableToLT),
    DelegableToLT: ResolverFactory.findByAddress(db, DataType.DelegableToLT),
    UserBalance: UserBalanceQueryResolverFactory(db, broker),
    userBalances: UserBalanceQueryResolverFactory(db, broker),
    events: EventsQueryResolverFactory(db),
    countEvents: EventsCountQueryResolverFactory(db),
    health: HealthQueryResolverFactory(broker),
  },
  Subscription: {
    Directory: ResolverFactory.subscribeByName(db, broker, DataType.Directory),
    ChargedToken: ResolverFactory.subscribeByNameAndAddress(db, broker, DataType.ChargedToken),
    InterfaceProjectToken: ResolverFactory.subscribeByNameAndAddress(db, broker, DataType.InterfaceProjectToken),
    DelegableToLT: ResolverFactory.subscribeByNameAndAddress(db, broker, DataType.DelegableToLT),
    userBalances: UserBalanceSubscriptionResolverFactory(db, broker),
    health: HealthSubscriptionResolverFactory(broker),
  },
});

export default resolversFactory;
