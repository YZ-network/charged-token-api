export abstract class AbstractWorkerManager {
  abstract start(): Promise<void>;

  abstract getStatus(): ChainHealth[];

  abstract destroy(): void;
}
