import { InterfaceProjectTokenModel, type IInterfaceProjectToken } from "../InterfaceProjectToken";

jest.unmock("mongoose");
jest.unmock("mongodb");

describe("InterfaceProjectTokenModel", () => {
  function sampleData(): IInterfaceProjectToken {
    return {
      chainId: 1337,
      initBlock: 15,
      lastUpdateBlock: 20,
      address: "0xADDRESS",
      // ownable
      owner: "0xOWNER",
      // other
      liquidityToken: "0xLT",
      projectToken: "0xPT",
      dateLaunch: "1",
      dateEndCliff: "2",
      claimFeesPerThousandForPT: "3",
    };
  }

  test("should convert business object to mongo model", () => {
    const bo: IInterfaceProjectToken = sampleData();

    const model = InterfaceProjectTokenModel.toModel(bo);

    expect(model.toJSON()).toMatchObject(bo);
  });

  test("should convert mongo model to business object in graphql format", () => {
    const sample = sampleData();
    const model = new InterfaceProjectTokenModel(sample);

    const bo = InterfaceProjectTokenModel.toGraphQL(model);

    expect(bo._id).toBeDefined();
    expect(bo).toMatchObject(sample);
  });
});
