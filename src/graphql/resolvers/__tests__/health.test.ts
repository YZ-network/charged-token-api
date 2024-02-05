import pubSub from "../../../pubsub";
import { HealthQueryResolver, HealthSubscriptionResolver } from "../health";

jest.mock("../../../globals");
jest.mock("../../../pubsub");
jest.mock("../../../models");
jest.mock("../../../main");

describe("Health check query resolver", () => {
  it("should return health from matching channel", async () => {
    const returnMock = jest.fn();
    returnMock.mockResolvedValueOnce("pouet");

    const subscribeMock = jest.fn(() => {
      return { return: returnMock };
    });

    (pubSub as any).subscribe.mockImplementation(subscribeMock);

    const result = await HealthQueryResolver();

    expect(result).toStrictEqual("pouet");
    expect(subscribeMock).toBeCalled();
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

    const subscribeMock = jest.fn(() => {
      return { next: nextMock, return: returnMock };
    });

    (pubSub as any).subscribe.mockImplementation(subscribeMock);

    expect(HealthSubscriptionResolver.resolve("pouet")).toBe("pouet");

    const result = HealthSubscriptionResolver.subscribe(undefined);

    expect(await result.next()).toStrictEqual({ value: 1, done: false });
    expect(await result.next()).toStrictEqual({ value: 2, done: false });
    expect(await result.next()).toStrictEqual({ value: 3, done: false });
    expect(await result.return()).toStrictEqual({ value: undefined, done: true });

    expect(nextMock).toBeCalledTimes(healthCount);
    expect(returnMock).toBeCalledTimes(1);
  });
});
