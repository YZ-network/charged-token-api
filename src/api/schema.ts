import { createSchema } from "graphql-yoga";

import { AbstractBroker } from "../core/AbstractBroker";
import { AbstractDbRepository } from "../core/AbstractDbRepository";
import resolversFactory from "./resolvers";

const schemaFactory = (db: AbstractDbRepository, broker: AbstractBroker) =>
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

  type IEvent {
    status: String!
    chainId: Int!
    address: String!
    blockNumber: Int!
    blockDate: String!
    txHash: String!
    txIndex: Int!
    logIndex: Int!
    name: String!
    contract: String!
    topics: [String!]!
    args: [String!]!
  }

  type Query {
    Directory(chainId: Int!): IDirectory
    allChargedTokens(chainId: Int!): [IChargedToken!]!
    ChargedToken(chainId: Int!, address: String!): IChargedToken!
    allInterfaceProjectTokens(chainId: Int!): [IInterfaceProjectToken!]!
    InterfaceProjectToken(chainId: Int!, address: String!): IInterfaceProjectToken!
    allDelegableToLTs(chainId: Int!): [IDelegableToLT!]!
    DelegableToLT(chainId: Int!, address: String!): IDelegableToLT!
    UserBalance(chainId: Int!, user: String!, address: String!): IUserBalancesEntry
    userBalances(chainId: Int!, user: String!): [IUserBalancesEntry!]!
    events(chainId: Int!, offset: Int, count: Int): [IEvent!]!
    countEvents(chainId: Int!): Int!
    health: [IWorkerHealth!]!
  }

  type Subscription {
    Directory(chainId: Int!): IDirectory
    ChargedToken(chainId: Int!, address: String!): IChargedToken!
    InterfaceProjectToken(chainId: Int!, address: String!): IInterfaceProjectToken!
    DelegableToLT(chainId: Int!, address: String!): IDelegableToLT!
    userBalances(chainId: Int!, user: String!): [IUserBalancesEntry!]!
    health: [IWorkerHealth!]!
  }
`,
    resolvers: resolversFactory(db, broker),
  });

export default schemaFactory;