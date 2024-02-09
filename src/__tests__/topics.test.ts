import mockedTopicsMap from "../topics";

jest.unmock("ethers");

jest.mock("../config");
jest.mock("../topics");

describe("Topics map", () => {
  test("should compute topics map", () => {
    const topics = jest.requireActual("../topics");

    expect(topics.default).toEqual(mockedTopicsMap);
  });
});
