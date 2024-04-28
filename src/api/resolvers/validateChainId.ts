import { GraphQLError } from "graphql";
import { Config } from "../../config";
import { rootLogger } from "../../rootLogger";

const log = rootLogger.child({ name: "ChainValidator" });

export function validateChainId(chainId: number): void {
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
}
