import { ChargedTokenModel, DelegableToLTModel, InterfaceProjectTokenModel } from "../../models";
import { DirectoryQueryResolver } from "./directory";
import { EventsCountQueryResolver, EventsQueryResolver } from "./events";
import { ResolverFactory } from "./factory";
import { HealthQueryResolver, HealthSubscriptionResolver } from "./health";
import { UserBalanceQueryResolver, UserBalanceSubscriptionResolver } from "./userBalance";

const resolvers = {
  Query: {
    Directory: DirectoryQueryResolver,
    allChargedTokens: ResolverFactory.findAll(ChargedTokenModel),
    ChargedToken: ResolverFactory.findByAddress(ChargedTokenModel),
    allInterfaceProjectTokens: ResolverFactory.findAll(InterfaceProjectTokenModel),
    InterfaceProjectToken: ResolverFactory.findByAddress(InterfaceProjectTokenModel),
    allDelegableToLTs: ResolverFactory.findAll(DelegableToLTModel),
    DelegableToLT: ResolverFactory.findByAddress(DelegableToLTModel),
    UserBalance: UserBalanceQueryResolver,
    userBalances: UserBalanceQueryResolver,
    events: EventsQueryResolver,
    countEvents: EventsCountQueryResolver,
    health: HealthQueryResolver,
  },
  Subscription: {
    Directory: ResolverFactory.subscribeByName("Directory"),
    ChargedToken: ResolverFactory.subscribeByNameAndAddress("ChargedToken"),
    InterfaceProjectToken: ResolverFactory.subscribeByNameAndAddress("InterfaceProjectToken"),
    DelegableToLT: ResolverFactory.subscribeByNameAndAddress("DelegableToLT"),
    userBalances: UserBalanceSubscriptionResolver,
    health: HealthSubscriptionResolver,
  },
};

export default resolvers;
