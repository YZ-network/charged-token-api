import { Repeater } from "graphql-yoga";
import { Main } from "../../../main";
import { HealthQueryResolver, HealthSubscriptionResolver } from "../health";

jest.mock("../../../config");
jest.mock("../../pubsub");
jest.mock("../../../models");
jest.mock("../../../main");

describe("Health check query resolver", () => {
  it("should return health from Main singleton", async () => {
    (Main as any).health.mockReturnValueOnce("pouet");

    const result = await HealthQueryResolver();

    expect(result).toStrictEqual("pouet");
    expect(Main.health).toBeCalled();
  });

  it("should return periodic health status until stopped", async () => {
    let healthCount = 0;
    (Main as any).health.mockImplementation(() => ++healthCount);

    expect(HealthSubscriptionResolver.resolve("pouet")).toBe("pouet");

    const result = HealthSubscriptionResolver.subscribe(undefined, { pollingMs: 10 });

    expect(result).toBeInstanceOf(Repeater);

    expect(await result.next()).toStrictEqual({ value: 1, done: false });
    expect(await result.next()).toStrictEqual({ value: 2, done: false });
    expect(await result.next()).toStrictEqual({ value: 3, done: false });
    expect(await result.return()).toStrictEqual({ value: undefined, done: true });

    expect(Main.health).toBeCalledTimes(healthCount);
  });
});
