export const ClientSession = jest.fn().mockImplementation(() => {
  return {
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    abortTransaction: jest.fn(),
    withTransaction: jest.fn(),
    endSession: jest.fn(),
  };
});
