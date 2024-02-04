import { AbstractDbRepository } from "../../../loaders/AbstractDbRepository";
import { MockDbRepository } from "../../../loaders/__mocks__/MockDbRepository";
import { IDirectory } from "../../../models";
import { DirectoryQueryResolver, DirectoryQueryResolverFactory } from "../directory";

jest.mock("../../../models");

describe("Directory query resolver", () => {
  let db: jest.Mocked<AbstractDbRepository>;
  let resolver: DirectoryQueryResolver;

  beforeEach(() => {
    db = new MockDbRepository();
    resolver = DirectoryQueryResolverFactory(db);
  });

  it("should query for a directory by chain id and return null when not found", async () => {
    const chainId = 129;

    db.getDirectory.mockResolvedValueOnce(null);

    const result = await resolver(undefined, { chainId });

    expect(result).toBe(null);
    expect(db.getDirectory).toBeCalledWith(chainId);
  });

  it("should query for a directory by chain id and return", async () => {
    const chainId = 129;

    const loadedModel = {
      chainId,
      directory: "0xDIRECTORY",
    } as unknown as IDirectory;
    db.getDirectory.mockResolvedValueOnce(loadedModel);

    const result = await resolver(undefined, { chainId });

    expect(result).toBe(loadedModel);
    expect(db.getDirectory).toBeCalledWith(chainId);
  });
});
