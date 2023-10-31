export const InterfaceProjectToken = jest.fn().mockImplementation(() => {
  return {
    init: jest.fn(),
    destroy: jest.fn(),
    subscribeToEvents: jest.fn(),
    setProjectTokenAddressOnBalances: jest.fn(),
    loadUserBalancePT: jest.fn(),
    loadValueProjectTokenToFullRecharge: jest.fn(),
    projectToken: {
      address: "0xPT",
    },
  };
});
