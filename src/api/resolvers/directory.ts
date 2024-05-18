import { GraphQLError } from "graphql";
import type { Logger } from "pino";
import type { AbstractDbRepository } from "../../core/AbstractDbRepository";
import { toGraphQL } from "./functions";
import { validateChainId } from "./validateChainId";

export type DirectoryQueryResolver = (_: any, { chainId }: { chainId: number }) => Promise<any>;

export const DirectoryQueryResolverFactory =
  (db: AbstractDbRepository, log: Logger) =>
  async (_: any, { chainId }: { chainId: number }) => {
    validateChainId(chainId);

    const directory = await db.getDirectory(chainId);

    if (directory === null) {
      const err = new GraphQLError("DIRECTORY_NOT_FOUND");
      log.error({ msg: err.message, chainId, err });
      throw err;
    }

    return toGraphQL(directory);
  };
