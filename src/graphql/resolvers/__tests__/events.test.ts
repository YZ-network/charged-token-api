import { AbstractDbRepository } from "../../../loaders/AbstractDbRepository";
import { MockDbRepository } from "../../../loaders/__mocks__/MockDbRepository";
import { EventModel } from "../../../models";
import {
  EventsCountQueryResolver,
  EventsCountQueryResolverFactory,
  EventsQueryResolver,
  EventsQueryResolverFactory,
} from "../events";

jest.mock("../../../models");

describe("Events query resolver", () => {
  let db: jest.Mocked<AbstractDbRepository>;
  let countResolver: EventsCountQueryResolver;
  let queryResolver: EventsQueryResolver;

  beforeEach(() => {
    db = new MockDbRepository();
    countResolver = EventsCountQueryResolverFactory(db);
    queryResolver = EventsQueryResolverFactory(db);
  });

  it("should query for events count by chain id", async () => {
    const chainId = 129;

    (EventModel as any).count.mockResolvedValueOnce(50);

    const result = await countResolver(undefined, { chainId });

    expect(result).toBe(50);
    expect(EventModel.count).toBeCalledWith({ chainId });
  });

  it("should query for events by chain id and return results", async () => {
    const chainId = 129;

    const events = [{ eventName: "A" }, { eventName: "B" }];
    const sortMock = {
      sort: jest.fn(async () => events),
    };
    const skipMock = {
      skip: jest.fn(() => sortMock),
    };
    const limitMock = {
      limit: jest.fn(() => skipMock),
    };
    (EventModel as any).find.mockReturnValueOnce(limitMock);
    (EventModel as any).toGraphQL.mockImplementation((value: any) => value);

    const result = await queryResolver(undefined, { chainId });

    expect(result).toStrictEqual(events);
    expect(EventModel.find).toBeCalledWith({ chainId });
    expect(EventModel.toGraphQL).toBeCalledTimes(events.length);
    expect(limitMock.limit).toBeCalledWith(20);
    expect(skipMock.skip).toBeCalledWith(0);
    expect(sortMock.sort).toBeCalledWith({
      blockNumber: "asc",
      txIndex: "asc",
      logIndex: "asc",
    });
  });

  it("should use query parameters for pagination", async () => {
    const chainId = 129;

    const events = [{ eventName: "A" }, { eventName: "B" }];
    const sortMock = {
      sort: jest.fn(async () => events),
    };
    const skipMock = {
      skip: jest.fn(() => sortMock),
    };
    const limitMock = {
      limit: jest.fn(() => skipMock),
    };
    (EventModel as any).find.mockReturnValueOnce(limitMock);

    await queryResolver(undefined, { chainId, offset: 15, count: 30 });

    expect(EventModel.find).toBeCalledWith({ chainId });
    expect(limitMock.limit).toBeCalledWith(30);
    expect(skipMock.skip).toBeCalledWith(15);
  });
});
