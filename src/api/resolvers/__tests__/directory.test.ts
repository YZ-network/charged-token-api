import { Logger } from "pino";
import { MockLogger } from "../../../__mocks__/MockLogger";
import { AbstractDbRepository } from "../../../core/AbstractDbRepository";
import { MockDbRepository } from "../../../core/__mocks__/MockDbRepository";
import { DirectoryQueryResolver, DirectoryQueryResolverFactory } from "../directory";

jest.mock("../../../config");

describe("Directory query resolver", () => {
  let db: jest.Mocked<AbstractDbRepository>;
  let log: jest.Mocked<Logger>;
  let resolver: DirectoryQueryResolver;

  beforeEach(() => {
    db = new MockDbRepository() as jest.Mocked<AbstractDbRepository>;
    log = new MockLogger() as jest.Mocked<Logger>;
    resolver = DirectoryQueryResolverFactory(db, log);
  });

  it("should throw when the chain id is not in the known networks", async () => {
    const chainId = 1337;

    db.getDirectory.mockResolvedValueOnce(null);

    await expect(resolver(undefined, { chainId })).rejects.toThrow("DIRECTORY_NOT_FOUND");

    expect(db.getDirectory).toBeCalledWith(chainId);
  });

  it("should throw when the network is disabled in configuration", async () => {
    const chainId = 666;

    await expect(resolver(undefined, { chainId })).rejects.toThrow("DISABLED_NETWORK");

    expect(db.getDirectory).not.toBeCalledWith(chainId);
  });

  it("should throw when the directory is not found", async () => {
    const chainId = 129;

    await expect(resolver(undefined, { chainId })).rejects.toThrow("UNKNOWN_NETWORK");

    expect(db.getDirectory).not.toBeCalled();
  });

  it("should query for a directory by chain id and return", async () => {
    const chainId = 1337;

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
