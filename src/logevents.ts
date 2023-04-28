import { ethers } from "ethers";
import Directory from "./contracts/ContractsDirectory.json";
import DelegableToLT from "./contracts/DelegableToLT.json";
import InterfaceProjectToken from "./contracts/InterfaceProjectToken.json";
import ChargedToken from "./contracts/LiquidityToken.json";

export function dumpEvents() {
  const dirInterface = new ethers.utils.Interface(Directory.abi);
  const ctInterface = new ethers.utils.Interface(ChargedToken.abi);
  const ifInterface = new ethers.utils.Interface(InterfaceProjectToken.abi);
  const ptInterface = new ethers.utils.Interface(DelegableToLT.abi);

  for (const e of Directory.abi.filter((ev) => ev.type === "event")) {
    console.log(
      "Directory:",
      e.name,
      ...dirInterface.encodeFilterTopics(e.name!, [])
    );
  }

  for (const e of ChargedToken.abi.filter((ev) => ev.type === "event")) {
    console.log(
      "LiquidityToken:",
      e.name,
      ...ctInterface.encodeFilterTopics(e.name!, [])
    );
  }

  for (const e of InterfaceProjectToken.abi.filter(
    (ev) => ev.type === "event"
  )) {
    console.log(
      "InterfaceProjectToken:",
      e.name,
      ...ifInterface.encodeFilterTopics(e.name!, [])
    );
  }

  for (const e of DelegableToLT.abi.filter((ev) => ev.type === "event")) {
    console.log(
      "DelegableToLT:",
      e.name,
      ...ptInterface.encodeFilterTopics(e.name!, [])
    );
  }
}
