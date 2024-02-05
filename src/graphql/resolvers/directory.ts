import { recordToEntryList } from "../../globals";
import { AbstractDbRepository } from "../../loaders/AbstractDbRepository";

export type DirectoryQueryResolver = (_: any, { chainId }: { chainId: number }) => Promise<any>;

export const DirectoryQueryResolverFactory =
  (db: AbstractDbRepository) =>
  async (_: any, { chainId }: { chainId: number }) => {
    const directory = await db.getDirectory(chainId);

    if (directory === null) {
      return null;
    }

    return {
      ...directory,
      projectRelatedToLT: recordToEntryList(directory.projectRelatedToLT),
      whitelist: recordToEntryList(directory.whitelist),
    };
  };
