import { DirectoryModel, type IDirectory } from "../Directory";

jest.unmock("mongoose");
jest.unmock("mongodb");

describe("DirectoryModel", () => {
  function sampleData(): IDirectory {
    return {
      owner: "0xOWNER",
      address: "0xADDRESS",
      chainId: 1337,
      initBlock: 15,
      lastUpdateBlock: 20,
      directory: ["a", "b"],
      whitelistedProjectOwners: ["c"],
      projects: ["d", "e"],
      projectRelatedToLT: { f: "g" },
      whitelist: { h: "i" },
      areUserFunctionsDisabled: true,
    };
  }

  test("should convert mongo model to business object in graphql format", () => {
    const sample = sampleData();
    const result = {
      ...sample,
      projectRelatedToLT: [{ key: "f", value: "g" }],
      whitelist: [{ key: "h", value: "i" }],
    };
    const model = new DirectoryModel(sample);

    const bo = DirectoryModel.toGraphQL(model);

    expect(bo._id).toBeDefined();
    expect(bo).toMatchObject(result);
  });
});
