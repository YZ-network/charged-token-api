import { ethers } from "ethers";
import { contracts } from "../contracts";
import { pubSub } from "../graphql";
import {
  ChargedTokenModel,
  DelegableToLTModel,
  DirectoryModel,
  IDirectory,
  InterfaceProjectTokenModel,
  UserBalanceModel,
} from "../models";
import { EMPTY_ADDRESS } from "../types";
import { AbstractLoader } from "./AbstractLoader";
import { ChargedToken } from "./ChargedToken";

export class Directory extends AbstractLoader<IDirectory> {
  readonly ct: Record<string, ChargedToken> = {};

  constructor(
    chainId: number,
    provider: ethers.providers.JsonRpcProvider,
    address: string
  ) {
    super(
      chainId,
      provider,
      address,
      contracts.ContractsDirectory,
      DirectoryModel
    );
  }

  async applyFunc(fn: (loader: any) => Promise<void>): Promise<void> {
    await super.applyFunc(fn);
    await Promise.all(
      Object.values(this.ct).map((loader) => loader.applyFunc(fn))
    );
  }

  async init(actualBlock?: number) {
    await super.init(actualBlock);

    this.lastState!.directory.forEach(
      (address) =>
        (this.ct[address] = new ChargedToken(
          this.chainId,
          this.provider,
          address,
          this
        ))
    );

    await Promise.all(
      Object.values(this.ct).map((ct: ChargedToken) =>
        ct.init(this.actualBlock)
      )
    );
  }

  toModel(data: IDirectory) {
    return (DirectoryModel as any).toModel(data);
  }

  notifyUpdate(): void {
    pubSub.publish(`${this.constructor.name}`, this.lastState);
  }

  async load() {
    console.log(this.chainId, "Reading directory @", this.address);

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
      chainId: this.chainId,
      initBlock:
        this.lastState !== undefined
          ? this.lastState.initBlock
          : this.actualBlock,
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
    console.log("Loading user balances for", user, "@", address);

    const startDate = new Date().getTime();

    const results =
      address === undefined
        ? await Promise.all(
            Object.values(this.ct).map((ct: ChargedToken) =>
              ct.loadUserBalances(user)
            )
          )
        : [await this.ct[address].loadUserBalances(user)];

    for (const entry of results) {
      if (await this.existUserBalances(user, entry.address)) {
        await UserBalanceModel.updateOne(
          { chainId: this.chainId, user, address: entry.address },
          entry
        );
      } else {
        await UserBalanceModel.toModel(entry).save();
      }
    }

    const saved = await UserBalanceModel.find({
      chainId: this.chainId,
      user,
    }).exec();

    if (saved !== null) {
      console.log("Publishing updated user balances for", user);

      pubSub.publish(
        `UserBalance.${this.chainId}.${user}`,
        JSON.stringify(
          saved.map((balance) => UserBalanceModel.toGraphQL(balance))
        )
      );
    }
    const stopDate = new Date().getTime();

    console.log(
      "USER BALANCES LOADED IN",
      (stopDate - startDate) / 1000,
      "seconds"
    );

    return results;
  }

  async existUserBalances(user: string, address: string): Promise<boolean> {
    return (
      (await UserBalanceModel.exists({
        chainId: this.chainId,
        user,
        address,
      })) !== null
    );
  }

  subscribeToEvents(): void {
    super.subscribeToEvents();
    Object.values(this.ct).forEach((ct) => ct.subscribeToEvents());
  }

  async onUserFunctionsAreDisabledEvent([
    areUserFunctionsDisabled,
  ]: any[]): Promise<void> {
    await this.applyUpdateAndNotify({ areUserFunctionsDisabled });
  }

  async onProjectOwnerWhitelistedEvent([
    projectOwner,
    project,
  ]: any[]): Promise<void> {
    const jsonModel = await this.getJsonModel();

    const update = {
      projects: [...jsonModel.projects, project],
      whitelistedProjectOwners: [
        ...jsonModel.whitelistedProjectOwners,
        projectOwner,
      ],
      whitelist: { ...jsonModel.whitelist, [projectOwner]: project },
    };

    await this.applyUpdateAndNotify(update);
  }

  async onAddedLTContractEvent([contract]: any[]): Promise<void> {
    const jsonModel = await this.getJsonModel();

    const update = {
      directory: [...jsonModel.directory, contract],
      projectRelatedToLT: {
        ...jsonModel.projectRelatedToLT,
        [contract]: await this.instance.projectRelatedToLT(contract),
      },
    };

    this.ct[contract] = new ChargedToken(
      this.chainId,
      this.provider,
      contract,
      this
    );
    await this.ct[contract].init(this.actualBlock);
    this.ct[contract].subscribeToEvents();

    await this.applyUpdateAndNotify(update);
  }

  async onRemovedLTContractEvent([contract]: any[]): Promise<void> {
    const jsonModel = await this.getJsonModel();

    const update = {
      directory: jsonModel.directory.filter((address) => address !== contract),
      projectRelatedToLT: {
        ...jsonModel.projectRelatedToLT,
        [contract]: undefined,
      },
    };

    const balanceAddressList: string[] = [];

    this.ct[contract].unsubscribeEvents();
    delete this.ct[contract];
    await ChargedTokenModel.deleteOne({
      chainId: this.chainId,
      address: contract,
    });
    balanceAddressList.push(contract);

    const iface = await InterfaceProjectTokenModel.findOne({
      chainId: this.chainId,
      liquidityToken: contract,
    });
    if (iface !== null) {
      balanceAddressList.push(iface.address);
      await InterfaceProjectTokenModel.deleteOne({
        chainId: this.chainId,
        address: iface.address,
      });
      if (
        iface.projectToken !== EMPTY_ADDRESS &&
        (await DelegableToLTModel.count({
          chainId: this.chainId,
          address: iface.projectToken,
        })) === 1
      ) {
        await DelegableToLTModel.deleteOne({
          chainId: this.chainId,
          address: iface.projectToken,
        });
        balanceAddressList.push(iface.projectToken);
      }
    }

    await UserBalanceModel.deleteMany({
      chainId: this.chainId,
      address: { $in: balanceAddressList },
    });

    await this.applyUpdateAndNotify(update);
  }

  async onRemovedProjectByAdminEvent([projectOwner]: any[]): Promise<void> {
    const jsonModel = await this.getJsonModel();

    const update = {
      projects: jsonModel.projects.filter(
        (_, index) => jsonModel.whitelistedProjectOwners[index] !== projectOwner
      ),
      directory: jsonModel.directory.filter(
        (ltAddress) => jsonModel.projectRelatedToLT[ltAddress] !== undefined
      ),
      whitelistedProjectOwners: jsonModel.whitelistedProjectOwners.filter(
        (address) => address !== projectOwner
      ),
      whitelist: { ...jsonModel.whitelist },
    };

    Object.entries(update.whitelist).forEach(([ownerAddress]) => {
      if (!update.whitelistedProjectOwners.includes(ownerAddress)) {
        delete update.whitelist[ownerAddress];
      }
    });

    await this.applyUpdateAndNotify(update);
  }

  async onChangedProjectOwnerAccountEvent([
    projectOwnerOld,
    projectOwnerNew,
  ]: any[]): Promise<void> {
    const jsonModel = await this.getJsonModel();

    const update = {
      whitelistedProjectOwners: jsonModel.whitelistedProjectOwners.map(
        (address) => (address === projectOwnerOld ? projectOwnerNew : address)
      ),
    };

    await this.applyUpdateAndNotify(update);
  }

  async onChangedProjectNameEvent([
    oldProjectName,
    newProjectName,
  ]: any[]): Promise<void> {
    const jsonModel = await this.getJsonModel();

    const update = {
      projects: jsonModel.projects.map((name) =>
        name === oldProjectName ? newProjectName : name
      ),
    };

    await this.applyUpdateAndNotify(update);
  }

  async onAllocatedLTToProjectEvent([contract, project]: any[]): Promise<void> {
    const jsonModel = await this.getJsonModel();

    const update = {
      projectRelatedToLT: {
        ...jsonModel.projectRelatedToLT,
        [contract]: project,
      },
      directory: [...jsonModel.directory, contract],
    };

    await this.applyUpdateAndNotify(update);
  }

  async onAllocatedProjectOwnerToProjectEvent([
    projectOwner,
    project,
  ]: any[]): Promise<void> {
    const jsonModel = await this.getJsonModel();

    const update = {
      whitelistedProjectOwners: [
        ...jsonModel.whitelistedProjectOwners,
        projectOwner,
      ],
      projects: [...jsonModel.projects, project],
    };

    await this.applyUpdateAndNotify(update);
  }
}
