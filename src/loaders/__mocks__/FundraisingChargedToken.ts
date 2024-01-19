export const FundraisingChargedToken = jest.fn().mockImplementation(() => {
  return {
    init: jest.fn(),
    subscribeToEvents: jest.fn(),
    loadUserBalances: jest.fn(),
    destroy: jest.fn(),
  };
});