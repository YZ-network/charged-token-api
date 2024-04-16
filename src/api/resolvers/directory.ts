import { GraphQLError } from "graphql";
import { Logger } from "pino";
import { Config } from "../../config";
import { AbstractDbRepository } from "../../core/AbstractDbRepository";
import { toGraphQL } from "./functions";

export type DirectoryQueryResolver = (_: any, { chainId }: { chainId: number }) => Promise<any>;

export const DirectoryQueryResolverFactory =
  (db: AbstractDbRepository, log: Logger) =>
  async (_: any, { chainId }: { chainId: number }) => {
    const network = Config.networks.find((network) => network.chainId === chainId);

    if (network === undefined) {
      log.warn({
        msg: "Network not found in configuration",
        chainId,
        configuredIds: Config.networks.map((network) => network.chainId),
      });
      throw new GraphQLError("UNKNOWN_NETWORK");
    } else if (!network.enabled) {
      log.warn({
        msg: "Network is disabled",
        chainId,
        configuredIds: Config.networks.map((network) => network.chainId),
      });
      throw new GraphQLError("DISABLED_NETWORK");
    }

    const directory = await db.getDirectory(chainId);

    if (directory === null) {
      const err = new GraphQLError("DIRECTORY_NOT_FOUND");
      log.error({ msg: err.message, chainId, err });
      throw err;
    }

    return toGraphQL(directory);
  };
