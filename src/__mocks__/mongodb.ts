export const ClientSession = jest.fn().mockImplementation(() => {
  return {
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
  };
});
