import { Repeater } from "graphql-yoga";
import { AbstractBroker } from "../../../core/AbstractBroker";
import { MockBroker } from "../../../core/__mocks__/MockBroker";
import { HealthQueryResolverFactory, HealthSubscriptionResolverFactory } from "../health";

jest.mock("../../../main");

describe("Health check query resolver", () => {
  let broker: jest.Mocked<AbstractBroker>;

  beforeEach(() => {
    broker = new MockBroker() as jest.Mocked<AbstractBroker>;
  });

  it("should return health from matching channel", async () => {
    const nextMock = jest.fn();
    nextMock.mockResolvedValueOnce({ value: "pouet", done: false });

    const returnMock = jest.fn();
    returnMock.mockResolvedValueOnce({ done: true });

    const resolver = HealthQueryResolverFactory(broker);

    broker.subscribeHealth.mockReturnValueOnce({ next: nextMock, return: returnMock } as unknown as Repeater<any>);

    const result = await resolver();

    expect(result).toStrictEqual("pouet");
    expect(broker.subscribeHealth).toBeCalled();
    expect(nextMock).toBeCalled();
    expect(returnMock).toBeCalled();
  });

  it("should return periodic health status until stopped", async () => {
    let healthCount = 0;
    const nextMock = jest.fn();
    nextMock.mockImplementation(async () => {
      return { value: ++healthCount, done: false };
    });

    const returnMock = jest.fn();
    returnMock.mockImplementation(async () => {
      return { value: undefined, done: true };
    });

    const resolver = HealthSubscriptionResolverFactory(broker);

    broker.subscribeHealth.mockReturnValueOnce({ next: nextMock, return: returnMock } as unknown as Repeater<any>);

    expect(resolver.resolve("pouet")).toBe("pouet");

    const result = resolver.subscribe(undefined);

    expect(await result.next()).toStrictEqual({ value: 1, done: false });
    expect(await result.next()).toStrictEqual({ value: 2, done: false });
    expect(await result.next()).toStrictEqual({ value: 3, done: false });
    expect(await result.return()).toStrictEqual({ value: undefined, done: true });

    expect(nextMock).toBeCalledTimes(healthCount);
    expect(returnMock).toBeCalledTimes(1);
  });
});
