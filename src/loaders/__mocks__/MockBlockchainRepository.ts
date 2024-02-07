import { AbstractBlockchainRepository } from "../AbstractBlockchainRepository";

export const MockBlockchainRepository: jest.Mock<AbstractBlockchainRepository> = jest.fn().mockImplementation(() => {
  return {
    getBlockNumber: jest.fn(),
    loadDirectory: jest.fn(),
    loadChargedToken: jest.fn(),
    getUserBalancePT: jest.fn(),
    getChargedTokenFundraisingStatus: jest.fn(),
    getProjectRelatedToLT: jest.fn(),
    getUserLiquiToken: jest.fn(),
    loadInterfaceProjectToken: jest.fn(),
    loadDelegableToLT: jest.fn(),
    loadUserBalances: jest.fn(),
    loadAndSyncEvents: jest.fn(),
    subscribeToEvents: jest.fn(),
    registerContract: jest.fn(),
    unregisterContract: jest.fn(),
    isContractRegistered: jest.fn(),
    getLastState: jest.fn(),
    isDelegableStillReferenced: jest.fn(),
    unsubscribeEvents: jest.fn(),
  };
});
