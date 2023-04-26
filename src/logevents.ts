import { ethers } from "ethers";
import Directory from "./contracts/ContractsDirectory.json";
import ChargedToken from "./contracts/LiquidityToken.json";

export function dumpEvents() {
  const dirInterface = new ethers.utils.Interface(Directory.abi);
  const ctInterface = new ethers.utils.Interface(ChargedToken.abi);

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
}
