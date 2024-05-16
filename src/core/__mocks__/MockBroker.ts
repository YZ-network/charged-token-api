import type { AbstractBroker } from "../AbstractBroker";

export const MockBroker: jest.Mock<AbstractBroker> = jest.fn().mockImplementation(() => {
  return {
    notifyUpdate: jest.fn(),
    notifyBalanceLoadingRequired: jest.fn(),
    notifyHealth: jest.fn(),

    subscribeHealth: jest.fn(),
    subscribeUpdates: jest.fn(),
    subscribeUpdatesByAddress: jest.fn(),
    subscribeBalanceLoadingRequests: jest.fn(),

    unsubscribe: jest.fn(),
    destroy: jest.fn(),
    removeSubscriptions: jest.fn(),
  };
});
