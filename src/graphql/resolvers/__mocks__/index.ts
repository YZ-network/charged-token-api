const resolvers = {
  Query: {
    Directory: jest.fn(),
    allChargedTokens: jest.fn(),
    ChargedToken: jest.fn(),
    allInterfaceProjectTokens: jest.fn(),
    InterfaceProjectToken: jest.fn(),
    allDelegableToLTs: jest.fn(),
    DelegableToLT: jest.fn(),
    UserBalance: jest.fn(),
    userBalances: jest.fn(),
    events: jest.fn(),
    countEvents: jest.fn(),
    health: jest.fn(),
  },
  Subscription: {
    Directory: {
      subscribe: jest.fn(),
      resolve: jest.fn(),
    },
    ChargedToken: {
      subscribe: jest.fn(),
      resolve: jest.fn(),
    },
    InterfaceProjectToken: {
      subscribe: jest.fn(),
      resolve: jest.fn(),
    },
    DelegableToLT: {
      subscribe: jest.fn(),
      resolve: jest.fn(),
    },
    userBalances: {
      subscribe: jest.fn(),
      resolve: jest.fn(),
    },
    health: {
      subscribe: jest.fn(),
      resolve: jest.fn(),
    },
  },
};

const resolversFactory = jest.fn(() => resolvers);

export default resolversFactory;
