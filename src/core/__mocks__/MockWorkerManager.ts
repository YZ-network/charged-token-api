import { AbstractWorkerManager } from "../AbstractWorkerManager";

export const MockWorkerManager: jest.Mock<AbstractWorkerManager> = jest.fn().mockImplementation(() => {
  return {
    getStatus: jest.fn(),
  };
});
