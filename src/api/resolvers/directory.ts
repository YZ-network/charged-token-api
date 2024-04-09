import { GraphQLError } from "graphql";
import { Config } from "../../config";
import { AbstractDbRepository } from "../../core/AbstractDbRepository";
import { rootLogger } from "../../rootLogger";
import { toGraphQL } from "./functions";

export type DirectoryQueryResolver = (_: any, { chainId }: { chainId: number }) => Promise<any>;

const log = rootLogger.child({ name: "DirectoryQueryResolver" });

export const DirectoryQueryResolverFactory =
  (db: AbstractDbRepository) =>
  async (_: any, { chainId }: { chainId: number }) => {
    const network = Config.networks.find((network) => network.chainId === chainId);

    if (network === undefined) {
      log.warn({
        chainId,
        msg: "Network not found in configuration",
        configuredIds: Config.networks.map((network) => network.chainId),
      });
      throw new GraphQLError("UNKNOWN_NETWORK");
    } else if (!network.enabled) {
      log.warn({
        chainId,
        msg: "Network is disabled",
        configuredIds: Config.networks.map((network) => network.chainId),
      });
      throw new GraphQLError("DISABLED_NETWORK");
    }

    const directory = await db.getDirectory(chainId);

    if (directory === null) {
      const err = new GraphQLError("DIRECTORY_NOT_FOUND");
      log.error({ chainId, msg: err.message, err });
      throw err;
    }

    return toGraphQL(directory);
  };
