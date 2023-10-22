export const pubSub = {
  publish: jest.fn(),
  subscribe: jest.fn(),
};

export default {
  resolvers: jest.fn().mockImplementation(() => {}),
  schema: jest.fn().mockImplementation(() => {}),
};
