export { BigNumber } from "ethers";

const Contract = jest.fn().mockImplementation(() => {
  return {
    // common functions
    on: jest.fn(),
    queryFilter: jest.fn(),
    removeAllListeners: jest.fn(),
    areUserFunctionsDisabled: jest.fn(),
    // ERC20 functions
    owner: jest.fn(),
    name: jest.fn(),
    symbol: jest.fn(),
    decimals: jest.fn(),
    totalSupply: jest.fn(),
    balanceOf: jest.fn(),
    // Directory functions
    countWhitelistedProjectOwners: jest.fn(),
    countLTContracts: jest.fn(),
    projectRelatedToLT: jest.fn(),
    getWhitelistedProjectOwner: jest.fn(),
    getWhitelistedProjectName: jest.fn(),
    whitelist: jest.fn(),
    getLTContract: jest.fn(),
    // ChargedToken functions
    fractionInitialUnlockPerThousand: jest.fn(),
    durationCliff: jest.fn(),
    durationLinearVesting: jest.fn(),
    maxInitialTokenAllocation: jest.fn(),
    maxWithdrawFeesPerThousandForLT: jest.fn(),
    maxClaimFeesPerThousandForPT: jest.fn(),
    maxStakingAPR: jest.fn(),
    maxStakingTokenAmount: jest.fn(),
    isInterfaceProjectTokenLocked: jest.fn(),
    areAllocationsTerminated: jest.fn(),
    interfaceProjectToken: jest.fn(),
    ratioFeesToRewardHodlersPerThousand: jest.fn(),
    currentRewardPerShare1e18: jest.fn(),
    stakedLT: jest.fn(),
    totalTokenAllocated: jest.fn(),
    withdrawFeesPerThousandForLT: jest.fn(),
    stakingStartDate: jest.fn(),
    stakingDuration: jest.fn(),
    stakingDateLastCheckpoint: jest.fn(),
    campaignStakingRewards: jest.fn(),
    totalStakingRewards: jest.fn(),
    getUserFullyChargedBalanceLiquiToken: jest.fn(),
    getUserPartiallyChargedBalanceLiquiToken: jest.fn(),
    getUserDateOfPartiallyChargedToken: jest.fn(),
    claimedRewardPerShare1e18: jest.fn(),
    userLiquiToken: jest.fn(),
    fundraisingTokenSymbol: jest.fn(),
    priceTokenPer1e18: jest.fn(),
    fundraisingToken: jest.fn(),
    isFundraisingActive: jest.fn(() => {
      throw new Error("Not implemented");
    }),
    // InterfaceProjectToken functions
    liquidityToken: jest.fn(),
    projectToken: jest.fn(),
    dateLaunch: jest.fn(),
    dateEndCliff: jest.fn(),
    claimFeesPerThousandForPT: jest.fn(),
    valueProjectTokenToFullRecharge: jest.fn(),
    // DelegableToLT functions
    countValidatedInterfaceProjectToken: jest.fn(),
    isListOfInterfaceProjectTokenComplete: jest.fn(),
    getValidatedInterfaceProjectToken: jest.fn(),
  };
});

const Interface = jest.fn().mockImplementation(() => {
  return {
    parseLog: jest.fn(),
    encodeFilterTopics: jest.fn(() => {
      throw new Error("Not implemented");
    }),
  };
});

const JsonRpcProvider = jest.fn().mockImplementation(() => {
  return {
    getBlock: jest.fn(),
    getBlockNumber: jest.fn(),
  };
});

export const ethers = {
  Contract,
  utils: {
    Interface,
  },
  providers: {
    JsonRpcProvider,
  },
};

export default ethers;
