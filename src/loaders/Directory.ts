import { ethers } from "ethers";
import { contracts } from "../contracts";
import { DirectoryModel, IDirectory } from "../models";
import { AbstractLoader } from "./AbstractLoader";
import { ChargedToken } from "./ChargedToken";

export class Directory extends AbstractLoader<IDirectory> {
  readonly ct: Record<string, ChargedToken> = {};

  constructor(provider: ethers.providers.JsonRpcProvider, address: string) {
    super(provider, address, contracts.ContractsDirectory);
  }

  async init() {
    await super.init();

    this.lastState!.directory.forEach(
      (address) => (this.ct[address] = new ChargedToken(this.provider, address))
    );

    await Promise.all(
      Object.values(this.ct).map((ct: ChargedToken) => ct.init())
    );

    this.subscribeToEvents();
  }

  async get() {
    return await DirectoryModel.findOne({ address: this.address });
  }

  async load() {
    console.log("Reading directory @", this.address);

    const ins = this.instance;

    const whitelistCount = (
      await ins.countWhitelistedProjectOwners()
    ).toNumber();
    const whitelistedProjectOwners: string[] = [];
    const projects: string[] = [];
    const whitelist: Map<string, string> = new Map();
    for (let i = 0; i < whitelistCount; i++) {
      const projectOwner = await ins.getWhitelistedProjectOwner(i);
      const projectName = await ins.getWhitelistedProjectName(i);
      whitelistedProjectOwners.push(projectOwner);
      projects.push(projectName);
      whitelist.set(projectOwner, await ins.whitelist(projectOwner));
    }

    const contractsCount = (await ins.countLTContracts()).toNumber();
    const directory: string[] = [];
    const projectRelatedToLT: Map<string, string> = new Map();
    for (let i = 0; i < contractsCount; i++) {
      const ctAddress = await ins.getLTContract(i);
      directory.push(ctAddress);
      projectRelatedToLT.set(
        ctAddress,
        await ins.projectRelatedToLT(ctAddress)
      );
    }

    return {
      lastUpdateBlock: this.actualBlock,
      address: this.address,
      owner: await ins.owner(),
      directory,
      whitelistedProjectOwners,
      projects,
      projectRelatedToLT,
      whitelist,
      areUserFunctionsDisabled: await ins.areUserFunctionsDisabled(),
    };
  }

  async syncEvents(fromBlock: number): Promise<void> {}

  subscribeToEvents() {
    // this.instance.
  }

  onEvent(name: string, ...args: any[]): void {}

  async saveOrUpdate(data: IDirectory) {
    let result;
    if (!(await DirectoryModel.exists({ address: data.address }))) {
      result = await this.toModel(data).save();
    } else {
      result = await DirectoryModel.updateOne({ address: data.address }, data);
    }
    this.lastUpdateBlock = this.actualBlock;
    this.lastState = result.toJSON();
    return result;
  }

  toModel(data: IDirectory) {
    return (DirectoryModel as any).toModel(data);
  }
}
