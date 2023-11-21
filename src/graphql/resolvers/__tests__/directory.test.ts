import { DirectoryModel } from "../../../models";
import { DirectoryQueryResolver } from "../directory";

jest.mock("../../../models");

describe("Directory query resolver", () => {
  it("should query for a directory by chain id and return null when not found", async () => {
    const chainId = 129;

    (DirectoryModel as any).findOne.mockResolvedValueOnce(null);

    const result = await DirectoryQueryResolver(undefined, { chainId });

    expect(result).toBe(null);
    expect(DirectoryModel.findOne).toBeCalledWith({ chainId });
  });

  it("should query for a directory by chain id and return", async () => {
    const chainId = 129;

    const loadedModel = {
      chainId,
      directory: "0xDIRECTORY",
    };
    (DirectoryModel as any).findOne.mockResolvedValueOnce(loadedModel);
    (DirectoryModel as any).toGraphQL.mockReturnValueOnce(loadedModel);

    const result = await DirectoryQueryResolver(undefined, { chainId });

    expect(result).toBe(loadedModel);
    expect(DirectoryModel.findOne).toBeCalledWith({ chainId });
    expect(DirectoryModel.toGraphQL).toBeCalledWith(loadedModel);
  });
});
