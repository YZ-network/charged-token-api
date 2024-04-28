import { AbstractDbRepository } from "../../../core/AbstractDbRepository";
import { MockDbRepository } from "../../../core/__mocks__/MockDbRepository";
import {
  EventsCountQueryResolver,
  EventsCountQueryResolverFactory,
  EventsQueryResolver,
  EventsQueryResolverFactory,
} from "../events";

describe("Events query resolver", () => {
  let db: jest.Mocked<AbstractDbRepository>;
  let countResolver: EventsCountQueryResolver;
  let queryResolver: EventsQueryResolver;

  beforeEach(() => {
    db = new MockDbRepository() as jest.Mocked<AbstractDbRepository>;
    countResolver = EventsCountQueryResolverFactory(db);
    queryResolver = EventsQueryResolverFactory(db);
  });

  it("should query for events count by chain id", async () => {
    const chainId = 1337;

    db.countEvents.mockResolvedValueOnce(50);

    const result = await countResolver(undefined, { chainId });

    expect(result).toBe(50);
    expect(db.countEvents).toBeCalledWith(chainId);
  });

  it("should query for events by chain id and return results", async () => {
    const chainId = 1337;

    const events = [{ eventName: "A" }, { eventName: "B" }] as unknown[] as IEvent[];
    db.getEventsPaginated.mockResolvedValueOnce(events);

    const result = await queryResolver(undefined, { chainId });

    expect(result).toStrictEqual(events);
    expect(db.getEventsPaginated).toBeCalledWith(chainId, 20, 0);
  });

  it("should use query parameters for pagination", async () => {
    const chainId = 1337;

    const events = [{ eventName: "A" }, { eventName: "B" }] as unknown[] as IEvent[];
    db.getEventsPaginated.mockResolvedValueOnce(events);

    await queryResolver(undefined, { chainId, offset: 15, count: 30 });

    expect(db.getEventsPaginated).toBeCalledWith(chainId, 30, 15);
  });
});
