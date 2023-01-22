import { ethers } from "ethers";
import { contracts } from "../contracts";
import { AbstractLoader } from "./AbstractLoader";
import { ChargedToken } from "./ChargedToken";

export class Directory extends AbstractLoader {
  readonly ct: Record<string, ChargedToken> = {};

  constructor(provider: ethers.providers.JsonRpcProvider, address: string) {
    super(provider, address, contracts.ContractsDirectory);
  }

  async load(): Promise<Record<string, any>> {
    console.log("Reading directory @", this.address);

    const ins = this.instance;

    const whitelistCount = (
      await ins.countWhitelistedProjectOwners()
    ).toNumber();

    const whitelist = [];
    const projectNames = [];
    for (let i = 0; i < whitelistCount; i++) {
      whitelist.push(await ins.getWhitelistedProjectOwner(i));
      projectNames.push(await ins.getWhitelistedProjectName(i));
    }

    whitelist.forEach(
      (address) => (this.ct[address] = new ChargedToken(this.provider, address))
    );

    return {
      address: this.address,
      owner: await ins.owner(),
      whitelist,
    };
  }
}
