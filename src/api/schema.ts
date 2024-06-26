import { createSchema } from "graphql-yoga";

import type { Logger } from "pino";
import type { AbstractBroker } from "../core/AbstractBroker";
import type { AbstractDbRepository } from "../core/AbstractDbRepository";
import type { AbstractWorkerManager } from "../core/AbstractWorkerManager";
import resolversFactory from "./resolvers";

const schemaFactory = (
  db: AbstractDbRepository,
  broker: AbstractBroker,
  workerManager: AbstractWorkerManager,
  pino: Logger,
) =>
  createSchema({
    typeDefs: `
  type IEntry {
    key: String!
    value: String!
  }

  interface IOwnable {
    address: String!
    owner: String!
  }

  interface IERC20 {
    address: String!
    owner: String!

    name: String!
    symbol: String!
    decimals: String!
    totalSupply: String!
  }

  type IDirectory implements IOwnable {
    chainId: Int!
    address: String!
    owner: String!
    
    directory: [String!]!
    whitelistedProjectOwners: [String!]!
    projects: [String!]!
    projectRelatedToLT: [IEntry!]!
    whitelist: [IEntry!]!
    areUserFunctionsDisabled: Boolean!
  }

  type IChargedToken implements IERC20 {
    chainId: Int!
    address: String!
    owner: String!

    name: String!
    symbol: String!
    decimals: String!
    totalSupply: String!

    fractionInitialUnlockPerThousand: String!
    durationCliff: String!
    durationLinearVesting: String!
    maxInitialTokenAllocation: String!
    maxWithdrawFeesPerThousandForLT: String!
    maxClaimFeesPerThousandForPT: String!
    maxStakingAPR: String!
    maxStakingTokenAmount: String!

    stakingStartDate: String!
    stakingDuration: String!
    stakingDateLastCheckpoint: String!
    campaignStakingRewards: String!
    totalStakingRewards: String!

    areUserFunctionsDisabled: Boolean!
    isInterfaceProjectTokenLocked: Boolean!
    areAllocationsTerminated: Boolean!

    interfaceProjectToken: String!
    ratioFeesToRewardHodlersPerThousand: String!
    currentRewardPerShare1e18: String!
    stakedLT: String!
    totalLocked: String!
    totalTokenAllocated: String!
    withdrawFeesPerThousandForLT: String!

    isFundraisingContract: Boolean!
    fundraisingTokenSymbol: String!
    priceTokenPer1e18: String!
    fundraisingToken: String!
    isFundraisingActive: Boolean!
  }

  type IInterfaceProjectToken implements IOwnable {
    chainId: Int!
    address: String!
    owner: String!

    liquidityToken: String!
    projectToken: String!
    dateLaunch: String!
    dateEndCliff: String!
    claimFeesPerThousandForPT: String!
  }

  type IDelegableToLT implements IERC20 {
    chainId: Int!
    address: String!
    owner: String!

    name: String!
    symbol: String!
    decimals: String!
    totalSupply: String!

    validatedInterfaceProjectToken: [String!]!
    isListOfInterfaceProjectTokenComplete: Boolean
  }

  type IUserBalancesEntry {
    chainId: Int!
    user: String!
    address: String!
    balance: String!
    balancePT: String!
    fullyChargedBalance: String!
    partiallyChargedBalance: String!
    dateOfPartiallyCharged: String!
    claimedRewardPerShare1e18: String!
    valueProjectTokenToFullRecharge: String!
  }

  type IWorkerHealth {
    index: Int!
    rpc: String!
    directory: String!
    name: String
    chainId: Int
    providerStatus: String!
    workerStatus: String!
    wsStatus: String!
    restartCount: Int!
  }

  type ITransaction {
    chainId: Int!
    hash: String!
  }

  type Query {
    version: String!
    health: [IWorkerHealth!]!
    Directory(chainId: Int!): IDirectory
    allChargedTokens(chainId: Int!): [IChargedToken!]!
    ChargedToken(chainId: Int!, address: String!): IChargedToken!
    allInterfaceProjectTokens(chainId: Int!): [IInterfaceProjectToken!]!
    InterfaceProjectToken(chainId: Int!, address: String!): IInterfaceProjectToken!
    allDelegableToLTs(chainId: Int!): [IDelegableToLT!]!
    DelegableToLT(chainId: Int!, address: String!): IDelegableToLT!
    UserBalance(chainId: Int!, user: String!, address: String!): IUserBalancesEntry
    userBalances(chainId: Int!, user: String!): [IUserBalancesEntry!]!
  }

  type Subscription {
    Directory(chainId: Int!): IDirectory
    ChargedToken(chainId: Int!, address: String!): IChargedToken!
    InterfaceProjectToken(chainId: Int!, address: String!): IInterfaceProjectToken!
    DelegableToLT(chainId: Int!, address: String!): IDelegableToLT!
    userBalances(chainId: Int!, user: String!): [IUserBalancesEntry!]!
    transaction(chainId: Int!, hash: String!): ITransaction!
  }
`,
    resolvers: resolversFactory(db, broker, workerManager, pino),
  });

export default schemaFactory;
