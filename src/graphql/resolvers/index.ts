import { DataType } from "../../loaders";
import { AbstractDbRepository } from "../../loaders/AbstractDbRepository";
import { DirectoryQueryResolverFactory } from "./directory";
import { EventsCountQueryResolverFactory, EventsQueryResolverFactory } from "./events";
import { ResolverFactory } from "./factory";
import { HealthQueryResolver, HealthSubscriptionResolver } from "./health";
import { UserBalanceQueryResolverFactory, UserBalanceSubscriptionResolverFactory } from "./userBalance";

const resolversFactory = (db: AbstractDbRepository) => ({
  Query: {
    Directory: DirectoryQueryResolverFactory(db),
    allChargedTokens: ResolverFactory.findAll(db, DataType.ChargedToken),
    ChargedToken: ResolverFactory.findByAddress(db, DataType.ChargedToken),
    allInterfaceProjectTokens: ResolverFactory.findAll(db, DataType.InterfaceProjectToken),
    InterfaceProjectToken: ResolverFactory.findByAddress(db, DataType.InterfaceProjectToken),
    allDelegableToLTs: ResolverFactory.findAll(db, DataType.DelegableToLT),
    DelegableToLT: ResolverFactory.findByAddress(db, DataType.DelegableToLT),
    UserBalance: UserBalanceQueryResolverFactory(db),
    userBalances: UserBalanceQueryResolverFactory(db),
    events: EventsQueryResolverFactory(db),
    countEvents: EventsCountQueryResolverFactory(db),
    health: HealthQueryResolver,
  },
  Subscription: {
    Directory: ResolverFactory.subscribeByName(db, DataType.Directory),
    ChargedToken: ResolverFactory.subscribeByNameAndAddress(db, DataType.ChargedToken),
    InterfaceProjectToken: ResolverFactory.subscribeByNameAndAddress(db, DataType.InterfaceProjectToken),
    DelegableToLT: ResolverFactory.subscribeByNameAndAddress(db, DataType.DelegableToLT),
    userBalances: UserBalanceSubscriptionResolverFactory(db),
    health: HealthSubscriptionResolver,
  },
});

export default resolversFactory;
