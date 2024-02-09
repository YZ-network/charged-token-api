import { toGraphQL } from "../../globals";
import { AbstractDbRepository } from "../../loaders/AbstractDbRepository";

export type DirectoryQueryResolver = (_: any, { chainId }: { chainId: number }) => Promise<any>;

export const DirectoryQueryResolverFactory =
  (db: AbstractDbRepository) =>
  async (_: any, { chainId }: { chainId: number }) => {
    const directory = await db.getDirectory(chainId);

    if (directory === null) {
      throw new Error("Directory not found !");
    }

    return toGraphQL(directory);
  };
