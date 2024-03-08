import { GraphQLError } from "graphql";
import { AbstractDbRepository } from "../../core/AbstractDbRepository";
import { rootLogger } from "../../rootLogger";
import { toGraphQL } from "./functions";

export type DirectoryQueryResolver = (_: any, { chainId }: { chainId: number }) => Promise<any>;

const log = rootLogger.child({ name: "DirectoryQueryResolver" });

export const DirectoryQueryResolverFactory =
  (db: AbstractDbRepository) =>
  async (_: any, { chainId }: { chainId: number }) => {
    const directory = await db.getDirectory(chainId);

    if (directory === null) {
      const err = new GraphQLError("Directory not found !");
      log.error({ chainId, msg: err.message, err });
      throw err;
    }

    return toGraphQL(directory);
  };
