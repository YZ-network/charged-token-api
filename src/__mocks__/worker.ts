import { WorkerStatus } from "../enums";

export const ChainWorker = jest.fn().mockImplementation(() => {
  return {
    workerStatus: WorkerStatus.STARTED,
    start: jest.fn(),
  };
});
