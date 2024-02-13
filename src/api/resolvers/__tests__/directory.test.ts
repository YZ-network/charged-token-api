import { AbstractDbRepository } from "../../../core/AbstractDbRepository";
import { MockDbRepository } from "../../../core/__mocks__/MockDbRepository";
import { DirectoryQueryResolver, DirectoryQueryResolverFactory } from "../directory";

describe("Directory query resolver", () => {
  let db: jest.Mocked<AbstractDbRepository>;
  let resolver: DirectoryQueryResolver;

  beforeEach(() => {
    db = new MockDbRepository() as jest.Mocked<AbstractDbRepository>;
    resolver = DirectoryQueryResolverFactory(db);
  });

  it("should query for a directory by chain id and throw when not found", async () => {
    const chainId = 129;

    db.getDirectory.mockResolvedValueOnce(null);

    await expect(resolver(undefined, { chainId })).rejects.toThrow("Directory not found !");

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
