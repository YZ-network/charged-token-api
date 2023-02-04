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

    claimedRewardPerShare1e18: [IEntry!]!
    userLiquiToken: [IUserLiquiToken!]!

    interfaceProjectToken: String!
    ratioFeesToRewardHodlersPerThousand: String!
    currentRewardPerShare1e18: String!
    stakedLT: String!
    totalTokenAllocated: String!
    withdrawFeesPerThousandForLT: String!
  }

  type IInterfaceProjectToken implements IOwnable {
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

  type IChargedTokenBalance {
    balance: String!
    fullyChargedBalance: String!
    partiallyChargedBalance: String!
    dateOfPartiallyCharged: String!
  }

  type IChargedTokenClaims {
    balancePT: String!
    chargedClaimableProjectToken: String!
    claimableProjectToken: String!
    ptNeededToRecharge: String!
  }

  type IUserBalancesEntry {
    user: String!
    contract: String!
    balances: IChargedTokenBalance!
    claims: IChargedTokenClaims!
  }

  type IUserBalances {
    list: [IUserBalancesEntry!]!
  }

  type Query {
    Directory: IDirectory
    allChargedTokens: [IChargedToken!]!
    ChargedToken(address: String!): IChargedToken!
    allInterfaceProjectTokens: [IInterfaceProjectToken!]!
    InterfaceProjectToken(address: String!): IInterfaceProjectToken!
    allDelegableToLTs: [IDelegableToLT!]!
    DelegableToLT(address: String!): IDelegableToLT!
    userBalances(user: String!): [IUserBalances!]!
  }

  type Subscription {
    Directory: IDirectory
    ChargedToken(address: String!): IChargedToken!
    InterfaceProjectToken(address: String!): IInterfaceProjectToken!
    DelegableToLT(address: String!): IDelegableToLT!
    userBalances(user: String!): [IUserBalances!]!
  }
`,
  resolvers,
});

export default schema;
