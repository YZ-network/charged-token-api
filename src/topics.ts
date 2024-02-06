import { ethers } from "ethers";
import Directory from "./contracts/ContractsDirectory.json";
import DelegableToLT from "./contracts/DelegableToLT.json";
import InterfaceProjectToken from "./contracts/InterfaceProjectToken.json";
import ChargedToken from "./contracts/LiquidityToken.json";
import { rootLogger } from "./rootLogger";

const log = rootLogger.child({ name: "encodeEvents" });

export function encodeEvents() {
  const topicsMap: Record<string, Record<string, string>> = {
    Directory: {},
    ChargedToken: {},
    FundraisingChargedToken: {},
    InterfaceProjectToken: {},
    DelegableToLT: {},
  };

  const dirInterface = new ethers.utils.Interface(Directory.abi);
  const ctInterface = new ethers.utils.Interface(ChargedToken.abi);
  const ifInterface = new ethers.utils.Interface(InterfaceProjectToken.abi);
  const ptInterface = new ethers.utils.Interface(DelegableToLT.abi);

  for (const e of Directory.abi.filter((ev) => ev.type === "event")) {
    const [topic] = dirInterface.encodeFilterTopics(e.name, []) as string[];
    topicsMap.Directory[topic] = e.name!;
  }

  for (const e of ChargedToken.abi.filter((ev) => ev.type === "event")) {
    const [topic] = ctInterface.encodeFilterTopics(e.name!, []) as string[];
    topicsMap.ChargedToken[topic] = e.name!;
    topicsMap.FundraisingChargedToken[topic] = e.name!;
  }

  for (const e of InterfaceProjectToken.abi.filter((ev) => ev.type === "event")) {
    const [topic] = ifInterface.encodeFilterTopics(e.name!, []) as string[];
    topicsMap.InterfaceProjectToken[topic] = e.name!;
  }

  for (const e of DelegableToLT.abi.filter((ev) => ev.type === "event")) {
    const [topic] = ptInterface.encodeFilterTopics(e.name, []) as string[];
    topicsMap.DelegableToLT[topic] = e.name!;
  }

  log.info({ msg: "Initialized event topics map", topicsMap });

  return topicsMap;
}

const topicsMap: Record<string, Record<string, string>> = encodeEvents();

export default topicsMap;
