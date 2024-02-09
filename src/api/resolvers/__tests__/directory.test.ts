import { IDirectory } from "../../../core";
import { AbstractDbRepository } from "../../../core/AbstractDbRepository";
import { MockDbRepository } from "../../../core/__mocks__/MockDbRepository";
import { DirectoryQueryResolver, DirectoryQueryResolverFactory } from "../directory";

jest.mock("../../../db");

describe("Directory query resolver", () => {
  let db: jest.Mocked<AbstractDbRepository>;
  let resolver: DirectoryQueryResolver;

  beforeEach(() => {
    db = new MockDbRepository() as jest.Mocked<AbstractDbRepository>;
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
      projectRelatedToLT: {},
      whitelist: {},
    } as unknown as IDirectory;
    db.getDirectory.mockResolvedValueOnce(loadedModel);

    const result = await resolver(undefined, { chainId });

    expect(result).toStrictEqual({ ...loadedModel, projectRelatedToLT: [], whitelist: [] });
    expect(db.getDirectory).toBeCalledWith(chainId);
  });
});
