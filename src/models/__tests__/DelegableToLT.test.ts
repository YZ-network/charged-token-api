import { DelegableToLTModel, type IDelegableToLT } from "../DelegableToLT";

jest.unmock("mongoose");
jest.unmock("mongodb");

describe("DelegableToLTModel", () => {
  function sampleData(): IDelegableToLT {
    return {
      chainId: 1337,
      initBlock: 15,
      lastUpdateBlock: 20,
      address: "0xADDRESS",
      // ownable
      owner: "0xOWNER",
      // erc20
      name: "name",
      symbol: "symbol",
      decimals: "18",
      totalSupply: "19",
      // other
      validatedInterfaceProjectToken: ["0xA", "0xB"],
      isListOfInterfaceProjectTokenComplete: true,
    };
  }

  test("should convert business object to mongo model", () => {
    const bo: IDelegableToLT = sampleData();

    const model = DelegableToLTModel.toModel(bo);

    expect(model.toJSON()).toMatchObject(bo);
  });

  test("should convert mongo model to business object in graphql format", () => {
    const sample = sampleData();
    const model = new DelegableToLTModel(sample);

    const bo = DelegableToLTModel.toGraphQL(model);

    expect(bo._id).toBeDefined();
    expect(bo).toMatchObject(sample);
  });
});
