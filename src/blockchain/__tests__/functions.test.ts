import ethers from "ethers";
import { detectNegativeAmount, getBlockDate } from "../functions";

describe("Blockchain functions", () => {
  test("should memoize fetched blocks from the provider to reduce requests", async () => {
    const provider = new ethers.providers.JsonRpcProvider();

    (provider as any).getBlock.mockImplementation(async (blockNumber: number) => {
      return { timestamp: blockNumber * 86400 };
    });

    await getBlockDate(1, provider);
    await getBlockDate(3, provider);
    await getBlockDate(1, provider);
    await getBlockDate(2, provider);
    await getBlockDate(1, provider);
    await getBlockDate(2, provider);
    await getBlockDate(3, provider);

    expect(provider.getBlock).toBeCalledTimes(3);
    expect(provider.getBlock).toHaveBeenNthCalledWith(1, 1);
    expect(provider.getBlock).toHaveBeenNthCalledWith(2, 3);
    expect(provider.getBlock).toHaveBeenNthCalledWith(3, 2);
  });

  test("should throw if negative amount is detected in the given fields", () => {
    expect(() =>
      detectNegativeAmount(1337, "UserBalance", { balance: "10", balancePT: "-15" }, ["balance", "balancePT"]),
    ).toThrow("Invalid update detected : negative amounts in UserBalance");
  });
});
