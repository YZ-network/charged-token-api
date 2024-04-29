import { AbstractWorkerManager } from "../../core/AbstractWorkerManager";

export const HealthQueryResolverFactory = (workerManager: AbstractWorkerManager) => async () => {
  return workerManager.getStatus();
};
