import mockedTopicsMap from "../topics";

jest.mock("../topics");
jest.unmock("ethers");

describe("Topics map", () => {
  test("should compute topics map", () => {
    const topics = jest.requireActual("../topics");

    expect(topics.default).toEqual(mockedTopicsMap);
  });
});
