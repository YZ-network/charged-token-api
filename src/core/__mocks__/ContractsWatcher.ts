export const ContractsRegistry = jest.fn().mockImplementation(() => ({
  registerDirectory: jest.fn(),
  unregisterDirectory: jest.fn(),
  registerChargedToken: jest.fn(),
  unregisterChargedToken: jest.fn(),
  registerInterfaceProjectToken: jest.fn(),
  unregisterInterfaceProjectToken: jest.fn(),
  registerDelegableToLT: jest.fn(),
  unregisterDelegableToLT: jest.fn(),
}));
