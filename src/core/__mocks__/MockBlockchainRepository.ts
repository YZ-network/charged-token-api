import { AbstractBlockchainRepository } from "../AbstractBlockchainRepository";

export const MockBlockchainRepository: jest.Mock<AbstractBlockchainRepository> = jest.fn().mockImplementation(() => {
  return {
    getBlockNumber: jest.fn(),
    getUserBalance: jest.fn(),
    getUserBalancePT: jest.fn(),
    getUserPTBalanceFromDb: jest.fn(),
    setProjectTokenAddressOnBalances: jest.fn(),
    getChargedTokenFundraisingStatus: jest.fn(),
    getProjectRelatedToLT: jest.fn(),
    getUserLiquiToken: jest.fn(),
    loadUserBalances: jest.fn(),
    loadAllUserBalances: jest.fn(),
    subscribeToEvents: jest.fn(),
    registerContract: jest.fn(),
    unregisterContract: jest.fn(),
    isContractRegistered: jest.fn(),
    getLastState: jest.fn(),
    isDelegableStillReferenced: jest.fn(),
    unsubscribeEvents: jest.fn(),
    applyUpdateAndNotify: jest.fn(),
    updateBalanceAndNotify: jest.fn(),
    updatePTBalanceAndNotify: jest.fn(),
  };
});
