import { Logger } from "pino";
import { MockLogger } from "../../../__mocks__/MockLogger";
import { AbstractWorkerManager } from "../../../core/AbstractWorkerManager";
import { MockWorkerManager } from "../../../core/__mocks__/MockWorkerManager";
import { HealthQueryResolverFactory } from "../health";

describe("Health check query resolver", () => {
  let manager: jest.Mocked<AbstractWorkerManager>;
  let log: jest.Mocked<Logger>;

  beforeEach(() => {
    manager = new MockWorkerManager() as jest.Mocked<AbstractWorkerManager>;
    log = new MockLogger() as jest.Mocked<Logger>;
  });

  it("should return health from manager", async () => {
    const resolver = HealthQueryResolverFactory(manager);

    manager.getStatus.mockReturnValueOnce(["pouet"] as unknown as ChainHealth[]);

    const result = await resolver();

    expect(result).toStrictEqual(["pouet"]);
  });
});
