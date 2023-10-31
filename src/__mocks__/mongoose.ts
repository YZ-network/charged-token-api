const ClientSession = jest.fn().mockImplementation(() => {
  return {
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    abortTransaction: jest.fn(),
    withTransaction: jest.fn(),
    endSession: jest.fn(),
  };
});

const Schema = jest.fn().mockImplementation(() => {
  return {
    static: jest.fn(),
  };
});

export default {
  set: jest.fn(),
  connect: jest.fn(),
  startSession: jest.fn(() => {
    return { endSession: jest.fn() };
  }),
  ClientSession,
  Schema,
  model: jest.fn(),
};
