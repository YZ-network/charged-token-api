import { ethers } from "ethers";
import { FlattenMaps } from "mongoose";
import { contracts } from "../contracts";
import { pubSub } from "../graphql";
import {
  ChargedTokenModel,
  DirectoryModel,
  IDirectory,
  IUserBalance,
  UserBalanceModel,
} from "../models";
import { AbstractLoader } from "./AbstractLoader";
import { ChargedToken } from "./ChargedToken";

export class Directory extends AbstractLoader<IDirectory> {
  readonly ct: Record<string, ChargedToken> = {};

  constructor(provider: ethers.providers.JsonRpcProvider, address: string) {
    super(provider, address, contracts.ContractsDirectory, DirectoryModel);
  }

  async applyFunc(fn: (loader: any) => Promise<void>): Promise<void> {
    await super.applyFunc(fn);
    await Promise.all(
      Object.values(this.ct).map((loader) => loader.applyFunc(fn))
    );
  }

  async init() {
    await super.init();

    this.lastState!.directory.forEach(
      (address) =>
        (this.ct[address] = new ChargedToken(this.provider, address, this))
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

  async loadAllUserBalances(user: string, address?: string) {
    console.log("Loading user balances for", user);
    const results =
      address === undefined
        ? await Promise.all(
            Object.values(this.ct).map((ct: ChargedToken) =>
              ct.loadUserBalances(user)
            )
          )
        : [await this.ct[address].loadUserBalances(user)];

    console.log("Saving user balances for", user);
    for (const entry of results) {
      if (await this.existUserBalances(user, address)) {
        await this.model.updateOne({ user, address: entry.address }, entry);
      } else {
        await UserBalanceModel.toModel(entry).save();
      }
    }

    console.log("Publishing updated user balances for", user);
    const saved = await UserBalanceModel.find({ user }).exec();
    console.log("Result :", saved);
    pubSub.publish(
      `UserBalance.${user}`,
      JSON.stringify(
        (saved != null ? saved : []).map((balance) =>
          UserBalanceModel.toGraphQL(balance)
        )
      )
    );

    return results;
  }

  async existUserBalances(user: string, address?: string): Promise<boolean> {
    return (await UserBalanceModel.exists({ user, address })) !== null;
  }

  async getUserBalances(
    user: string,
    address?: string
  ): Promise<FlattenMaps<IUserBalance>[]> {
    return (await UserBalanceModel.find({ user, address })).map((balance) =>
      UserBalanceModel.toGraphQL(balance)
    );
  }

  async onUserFunctionsAreDisabledEvent([
    areUserFunctionsDisabled,
  ]: any[]): Promise<void> {
    const jsonModel = await this.getJsonModel();

    jsonModel.areUserFunctionsDisabled = areUserFunctionsDisabled;

    await this.applyUpdateAndNotify(jsonModel);
  }

  async onProjectOwnerWhitelistedEvent([
    projectOwner,
    project,
  ]: any[]): Promise<void> {
    const jsonModel = await this.getJsonModel();

    jsonModel.projects.push(project);
    jsonModel.whitelistedProjectOwners.push(projectOwner);
    jsonModel.whitelist[projectOwner] = project;

    await this.applyUpdateAndNotify(jsonModel);
  }

  async onAddedLTContractEvent([contract]: any[]): Promise<void> {
    const jsonModel = await this.getJsonModel();

    jsonModel.directory.push(contract);
    jsonModel.projectRelatedToLT[contract] =
      await this.instance.projectRelatedToLT(contract);

    await this.applyUpdateAndNotify(jsonModel);

    this.ct[contract] = new ChargedToken(this.provider, contract, this);
    await this.ct[contract].init();
  }

  async onRemovedLTContractEvent([contract]: any[]): Promise<void> {
    const jsonModel = await this.getJsonModel();

    jsonModel.directory = jsonModel.directory.filter(
      (address) => address !== contract
    );
    delete jsonModel.projectRelatedToLT[contract];

    delete this.ct[contract];
    await ChargedTokenModel.deleteOne({ address: contract });
    await UserBalanceModel.deleteMany({ address: contract });

    await this.applyUpdateAndNotify(jsonModel);
  }

  async onRemovedProjectByAdminEvent([projectOwner]: any[]): Promise<void> {
    const jsonModel = await this.getJsonModel();

    jsonModel.projects = jsonModel.projects.filter(
      (_, index) => jsonModel.whitelistedProjectOwners[index] !== projectOwner
    );

    jsonModel.whitelistedProjectOwners =
      jsonModel.whitelistedProjectOwners.filter(
        (address) => address !== projectOwner
      );

    Object.entries(jsonModel.projectRelatedToLT).forEach(
      ([ltAddress, projectName]) => {
        if (!jsonModel.projects.includes(projectName)) {
          delete jsonModel.projectRelatedToLT[ltAddress];
        }
      }
    );
    Object.entries(jsonModel.whitelist).forEach(([ownerAddress]) => {
      if (!jsonModel.whitelistedProjectOwners.includes(ownerAddress)) {
        delete jsonModel.whitelist[ownerAddress];
      }
    });

    jsonModel.directory = jsonModel.directory.filter(
      (ltAddress) => jsonModel.projectRelatedToLT[ltAddress] !== undefined
    );

    await this.applyUpdateAndNotify(jsonModel);
  }

  async onChangedProjectOwnerAccountEvent([
    projectOwnerOld,
    projectOwnerNew,
  ]: any[]): Promise<void> {
    const jsonModel = await this.getJsonModel();

    jsonModel.whitelistedProjectOwners = jsonModel.whitelistedProjectOwners.map(
      (address) => (address === projectOwnerOld ? projectOwnerNew : address)
    );

    await this.applyUpdateAndNotify(jsonModel);
  }

  async onChangedProjectNameEvent([
    oldProjectName,
    newProjectName,
  ]: any[]): Promise<void> {
    const jsonModel = await this.getJsonModel();

    jsonModel.projects = jsonModel.projects.map((name) =>
      name === oldProjectName ? newProjectName : name
    );

    await this.applyUpdateAndNotify(jsonModel);
  }

  async onAllocatedLTToProjectEvent([contract, project]: any[]): Promise<void> {
    const jsonModel = await this.getJsonModel();

    jsonModel.projectRelatedToLT[contract] = project;
    jsonModel.directory.push(contract);

    await this.applyUpdateAndNotify(jsonModel);
  }

  async onAllocatedProjectOwnerToProjectEvent([
    projectOwner,
    project,
  ]: any[]): Promise<void> {
    const jsonModel = await this.getJsonModel();

    jsonModel.whitelistedProjectOwners.push(projectOwner);
    jsonModel.projects.push(project);

    await this.applyUpdateAndNotify(jsonModel);
  }
}
