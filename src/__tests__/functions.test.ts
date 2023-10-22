import { recordToEntryList } from "../functions";

describe("Common functions", () => {
  test("converts record to list of entries with key and value", () => {
    expect(recordToEntryList({})).toStrictEqual([]);
    expect(recordToEntryList({ a: "1" })).toStrictEqual([
      { key: "a", value: "1" },
    ]);
    expect(recordToEntryList({ a: "1", b: "3", x: "6" })).toStrictEqual([
      { key: "a", value: "1" },
      { key: "b", value: "3" },
      { key: "x", value: "6" },
    ]);
  });
});
