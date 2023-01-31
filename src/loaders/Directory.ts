import { ethers } from "ethers";
import { contracts } from "../contracts";
import { pubSub } from "../graphql";
import { DirectoryModel, IDirectory } from "../models";
import { AbstractLoader } from "./AbstractLoader";
import { ChargedToken } from "./ChargedToken";

export class Directory extends AbstractLoader<IDirectory> {
  readonly ct: Record<string, ChargedToken> = {};

  constructor(provider: ethers.providers.JsonRpcProvider, address: string) {
    super(provider, address, contracts.ContractsDirectory, DirectoryModel);
  }

  async apply(fn: (loader: any) => Promise<void>): Promise<void> {
    await super.apply(fn);
    await Promise.all(Object.values(this.ct).map((loader) => loader.apply(fn)));
  }

  async init() {
    await super.init();

    this.lastState!.directory.forEach(
      (address) => (this.ct[address] = new ChargedToken(this.provider, address))
    );

    await Promise.all(
      Object.values(this.ct).map((ct: ChargedToken) => ct.init())
    );
  }

  toModel(data: IDirectory) {
    return (DirectoryModel as any).toModel(data);
  }

  notifyUpdate(): void {
    pubSub.publish(`${this.constructor.name}`, this.lastState);
  }

  async load() {
    console.log("Reading directory @", this.address);

    const ins = this.instance;

    const whitelistCount = (
      await ins.countWhitelistedProjectOwners()
    ).toNumber();
    const whitelistedProjectOwners: string[] = [];
    const projects: string[] = [];
    const whitelist: Record<string, string> = {};
    for (let i = 0; i < whitelistCount; i++) {
      const projectOwner = await ins.getWhitelistedProjectOwner(i);
      const projectName = await ins.getWhitelistedProjectName(i);
      whitelistedProjectOwners.push(projectOwner);
      projects.push(projectName);
      whitelist[projectOwner] = await ins.whitelist(projectOwner);
    }

    const contractsCount = (await ins.countLTContracts()).toNumber();
    const directory: string[] = [];
    const projectRelatedToLT: Record<string, string> = {};
    for (let i = 0; i < contractsCount; i++) {
      const ctAddress = await ins.getLTContract(i);
      directory.push(ctAddress);
      projectRelatedToLT[ctAddress] = await ins.projectRelatedToLT(ctAddress);
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

  onUserFunctionsAreDisabledEvent([areUserFunctionsDisabled]: any[]): void {}
  onProjectOwnerWhitelistedEvent([projectOwner, project]: any[]): void {}
  onAddedLTContractEvent([contract]: any[]): void {}
  onRemovedLTContractEvent([contract]: any[]): void {}
  onRemovedProjectByAdminEvent([projectOwner]: any[]): void {}
  onChangedProjectOwnerAccountEvent([
    projectOwnerOld,
    projectOwnerNew,
  ]: any[]): void {}
  onChangedProjectNameEvent([oldProjectName, newProjectName]: any[]): void {}
  onAllocatedLTToProjectEvent([contract, project]: any[]): void {}
  onAllocatedProjectOwnerToProjectEvent([projectOwner, project]: any[]): void {}
}
