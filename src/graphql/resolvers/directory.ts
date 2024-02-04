import { AbstractDbRepository } from "../../loaders/AbstractDbRepository";

export const DirectoryQueryResolverFactory =
  (db: AbstractDbRepository) =>
  async (_: any, { chainId }: { chainId: number }) => {
    const directory = await db.getDirectory(chainId);

    if (directory === null) {
      return null;
    }

    return directory; // TODO convert to graphql format
  };
