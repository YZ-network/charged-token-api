export const Directory = jest.fn().mockImplementation(() => {
  return {
    eventsListener: {},
    init: jest.fn(),
    destroy: jest.fn(),
    subscribeToEvents: jest.fn(),
    loadAllUserBalances: jest.fn(),
  };
});
