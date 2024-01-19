import ethers from "ethers";
import { getBlockDate, recordToEntryList } from "../globals";

describe("Common functions", () => {
  test("converts record to list of entries with key and value", () => {
    expect(recordToEntryList({})).toStrictEqual([]);
    expect(recordToEntryList({ a: "1" })).toStrictEqual([{ key: "a", value: "1" }]);
    expect(recordToEntryList({ a: "1", b: "3", x: "6" })).toStrictEqual([
      { key: "a", value: "1" },
      { key: "b", value: "3" },
      { key: "x", value: "6" },
    ]);
  });

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
});
