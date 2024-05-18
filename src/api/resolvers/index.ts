import type { Logger } from "pino";
import type { AbstractBroker } from "../../core/AbstractBroker";
import type { AbstractDbRepository } from "../../core/AbstractDbRepository";
import type { AbstractWorkerManager } from "../../core/AbstractWorkerManager";
import { DirectoryQueryResolverFactory } from "./directory";
import { ResolverFactory } from "./factory";
import { HealthQueryResolverFactory } from "./health";
import { TransactionSubscriptionResolverFactory } from "./transaction";
import { UserBalanceQueryResolverFactory, UserBalanceSubscriptionResolverFactory } from "./userBalance";
import { VersionQueryResolver } from "./version";

const resolversFactory = (
  db: AbstractDbRepository,
  broker: AbstractBroker,
  workerManager: AbstractWorkerManager,
  log: Logger,
) => ({
  Query: {
    version: VersionQueryResolver,
    health: HealthQueryResolverFactory(workerManager),
    Directory: DirectoryQueryResolverFactory(db, log.child({ query: "Directory" })),
    allChargedTokens: ResolverFactory.findAll(db, "ChargedToken"),
    ChargedToken: ResolverFactory.findByAddress(db, "ChargedToken"),
    allInterfaceProjectTokens: ResolverFactory.findAll(db, "InterfaceProjectToken"),
    InterfaceProjectToken: ResolverFactory.findByAddress(db, "InterfaceProjectToken"),
    allDelegableToLTs: ResolverFactory.findAll(db, "DelegableToLT"),
    DelegableToLT: ResolverFactory.findByAddress(db, "DelegableToLT"),
    UserBalance: UserBalanceQueryResolverFactory(db, broker, log.child({ query: "UserBalance" })),
    userBalances: UserBalanceQueryResolverFactory(db, broker, log.child({ query: "userBalances" })),
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
    transaction: TransactionSubscriptionResolverFactory(db, broker, log.child({ subscription: "transaction" })),
  },
});

export default resolversFactory;
