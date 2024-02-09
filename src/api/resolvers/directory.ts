import { AbstractDbRepository } from "../../core/AbstractDbRepository";
import { toGraphQL } from "./functions";

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
