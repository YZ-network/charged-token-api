import { AbstractDbRepository } from "../AbstractDbRepository";

export const MockDbRepository: jest.Mock<AbstractDbRepository> = jest.fn().mockImplementation(() => {
  return {
    exists: jest.fn(),
    existsBalance: jest.fn(),
    existsEvent: jest.fn(),
    isUserBalancesLoaded: jest.fn(),
    countEvents: jest.fn(),
    get: jest.fn(),
    getAllMatching: jest.fn(),
    getDirectory: jest.fn(),
    getInterfaceByChargedToken: jest.fn(),
    getBalances: jest.fn(),
    getBalance: jest.fn(),
    getBalancesByProjectToken: jest.fn(),
    getAllEvents: jest.fn(),
    getEventsPaginated: jest.fn(),
    save: jest.fn(),
    saveBalance: jest.fn(),
    saveEvent: jest.fn(),
    update: jest.fn(),
    updateBalance: jest.fn(),
    updateOtherBalancesByProjectToken: jest.fn(),
    updateEventStatus: jest.fn(),
    delete: jest.fn(),
    deletePendingAndFailedEvents: jest.fn(),
  };
});