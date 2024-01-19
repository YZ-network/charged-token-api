import { WorkerStatus } from "../globals";

export const ChainWorker = jest.fn().mockImplementation(() => {
  return {
    workerStatus: WorkerStatus.STARTED,
    start: jest.fn(),
    status: jest.fn(),
  };
});
