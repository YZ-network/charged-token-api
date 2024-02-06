import { ethers } from "ethers";
import { contracts } from "./contracts";
import { rootLogger } from "./rootLogger";

const log = rootLogger.child({ name: "encodeEvents" });

export function encodeEvents() {
  const topicsMap: Record<string, Record<string, string>> = {
    Directory: {},
    ChargedToken: {},
    InterfaceProjectToken: {},
    DelegableToLT: {},
  };

  const dirInterface = new ethers.utils.Interface(contracts.ContractsDirectory.abi);
  const ctInterface = new ethers.utils.Interface(contracts.LiquidityToken.abi);
  const ifInterface = new ethers.utils.Interface(contracts.InterfaceProjectToken.abi);
  const ptInterface = new ethers.utils.Interface(contracts.DelegableToLT.abi);

  for (const e of contracts.ContractsDirectory.abi.filter((ev) => ev.type === "event")) {
    const [topic] = dirInterface.encodeFilterTopics(e.name, []) as string[];
    topicsMap.Directory[topic] = e.name!;
  }

  for (const e of contracts.LiquidityToken.abi.filter((ev) => ev.type === "event")) {
    const [topic] = ctInterface.encodeFilterTopics(e.name!, []) as string[];
    topicsMap.ChargedToken[topic] = e.name!;
  }

  for (const e of contracts.InterfaceProjectToken.abi.filter((ev) => ev.type === "event")) {
    const [topic] = ifInterface.encodeFilterTopics(e.name!, []) as string[];
    topicsMap.InterfaceProjectToken[topic] = e.name!;
  }

  for (const e of contracts.DelegableToLT.abi.filter((ev) => ev.type === "event")) {
    const [topic] = ptInterface.encodeFilterTopics(e.name, []) as string[];
    topicsMap.DelegableToLT[topic] = e.name!;
  }

  log.info({ msg: "Initialized event topics map", topicsMap });

  return topicsMap;
}

const topicsMap: Record<string, Record<string, string>> = encodeEvents();

export default topicsMap;
