export const DelegableToLT = jest.fn().mockImplementation(() => {
  return {
    address: "0xPT",
    init: jest.fn(),
    destroy: jest.fn(),
    subscribeToEvents: jest.fn(),
    loadUserBalance: jest.fn(),
  };
});
