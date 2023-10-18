export const pubSub = {
  publish: jest.fn()
};

export default {
  resolvers: jest.fn().mockImplementation(() => {}),
  schema: jest.fn().mockImplementation(() => {})
};
