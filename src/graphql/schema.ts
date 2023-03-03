import { createSchema } from "graphql-yoga";

import resolvers from "./resolvers";

const schema = createSchema({
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
    balances: [IEntry!]!
  }

  type IUserLiquiToken {
    owner: String!
    fullyChargedBalance: String!
    partiallyChargedBalance: String!
    dateOfPartiallyCharged: String!
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
    balances: [IEntry!]!

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

    claimedRewardPerShare1e18: [IEntry!]
    userLiquiToken: [IUserLiquiToken!]

    interfaceProjectToken: String!
    ratioFeesToRewardHodlersPerThousand: String!
    currentRewardPerShare1e18: String!
    stakedLT: String!
    totalTokenAllocated: String!
    withdrawFeesPerThousandForLT: String!
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
    valueProjectTokenToFullRecharge: [IEntry!]!
  }

  type IDelegableToLT implements IERC20 {
    chainId: Int!
    address: String!
    owner: String!

    name: String!
    symbol: String!
    decimals: String!
    totalSupply: String!
    balances: [IEntry!]!

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

  type Query {
    Directory(chainId: Int!): IDirectory
    allChargedTokens(chainId: Int!): [IChargedToken!]!
    ChargedToken(chainId: Int!, address: String!): IChargedToken!
    allInterfaceProjectTokens(chainId: Int!): [IInterfaceProjectToken!]!
    InterfaceProjectToken(chainId: Int!, address: String!): IInterfaceProjectToken!
    allDelegableToLTs(chainId: Int!): [IDelegableToLT!]!
    DelegableToLT(chainId: Int!, address: String!): IDelegableToLT!
    userBalances(chainId: Int!, user: String!, address: String): [IUserBalancesEntry!]!
  }

  type Subscription {
    Directory(chainId: Int!): IDirectory
    ChargedToken(chainId: Int!, address: String!): IChargedToken!
    InterfaceProjectToken(chainId: Int!, address: String!): IInterfaceProjectToken!
    DelegableToLT(chainId: Int!, address: String!): IDelegableToLT!
    userBalances(chainId: Int!, user: String!): [IUserBalancesEntry!]!
  }
`,
  resolvers,
});

export default schema;
