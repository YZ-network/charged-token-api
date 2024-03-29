export const ChainWorker = jest.fn().mockImplementation(() => {
  return {
    workerStatus: "STARTED",
    start: jest.fn(() => Promise.resolve()),
    status: jest.fn(),
  };
});
