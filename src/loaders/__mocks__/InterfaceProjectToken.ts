export const InterfaceProjectToken = jest.fn().mockImplementation(() => {
  return {
    init: jest.fn(),
    destroy: jest.fn(),
    loadUserBalancePT: jest.fn(),
    loadValueProjectTokenToFullRecharge: jest.fn(),
  };
});
