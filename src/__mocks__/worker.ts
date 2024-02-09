export const ChainWorker = jest.fn().mockImplementation(() => {
  return {
    workerStatus: "STARTED",
    start: jest.fn(),
    status: jest.fn(),
  };
});
