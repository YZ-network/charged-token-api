export const pubSub = {
  publish: jest.fn(),
  subscribe: jest.fn(),
};

export const schemaFactory = jest.fn(() => ({
  schema: {},
  resolvers: {},
}));
