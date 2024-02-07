import { type ClientSession } from "mongodb";
import { AbstractBlockchainRepository } from "./AbstractBlockchainRepository";
import { AbstractLoader } from "./AbstractLoader";
import { ChargedToken } from "./ChargedToken";
import { DataType, IDirectory } from "./types";

export class Directory extends AbstractLoader<IDirectory> {
  constructor(chainId: number, blockchain: AbstractBlockchainRepository, address: string) {
    super(chainId, blockchain, address, DataType.Directory);
  }

  async onUserFunctionsAreDisabledEvent(
    session: ClientSession,
    [areUserFunctionsDisabled]: any[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {
    await this.applyUpdateAndNotify({ areUserFunctionsDisabled }, blockNumber, eventName);
  }

  async onProjectOwnerWhitelistedEvent(
    session: ClientSession,
    [projectOwner, project]: any[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {
    const jsonModel = this.getLastState();

    const updates = {
      projects: [...jsonModel.projects, project],
      whitelistedProjectOwners: [...jsonModel.whitelistedProjectOwners, projectOwner],
      whitelist: { ...jsonModel.whitelist, [projectOwner]: project },
    };

    await this.applyUpdateAndNotify(updates, blockNumber, eventName);
  }

  async onAddedLTContractEvent(
    session: ClientSession,
    [contract]: any[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {
    const jsonModel = this.getLastState();

    const updates = {
      directory: [...jsonModel.directory, contract],
      projectRelatedToLT: {
        ...jsonModel.projectRelatedToLT,
        [contract]: await this.blockchain.getProjectRelatedToLT(this.address, contract),
      },
    };

    await this.blockchain.registerContract(
      DataType.ChargedToken,
      contract,
      blockNumber,
      new ChargedToken(this.chainId, this.blockchain, contract),
    );

    await this.applyUpdateAndNotify(updates, blockNumber, eventName);
  }

  async onRemovedLTContractEvent(
    session: ClientSession,
    [contract]: any[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {
    const jsonModel = this.getLastState();

    const update = {
      directory: jsonModel.directory.filter((address) => address !== contract),
      projectRelatedToLT: Object.assign(
        {},
        ...Object.entries(jsonModel.projectRelatedToLT)
          .filter(([key]) => key !== contract)
          .map(([key, value]) => ({ [key]: value })),
      ),
    };

    this.log.info({
      msg: "Removing charged token from directory and database",
      chainId: this.chainId,
      address: contract,
    });

    await this.blockchain.unregisterContract(DataType.ChargedToken, contract, true);

    await this.applyUpdateAndNotify(update, blockNumber, eventName);
  }

  async onRemovedProjectByAdminEvent(
    session: ClientSession,
    [projectOwner]: any[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {
    const jsonModel = this.getLastState();

    const update = {
      projects: jsonModel.projects.filter((_, index) => jsonModel.whitelistedProjectOwners[index] !== projectOwner),
      whitelistedProjectOwners: jsonModel.whitelistedProjectOwners.filter((address) => address !== projectOwner),
      whitelist: { ...jsonModel.whitelist },
    };

    delete update.whitelist[projectOwner];

    await this.applyUpdateAndNotify(update, blockNumber, eventName);
  }

  async onChangedProjectOwnerAccountEvent(
    session: ClientSession,
    [projectOwnerOld, projectOwnerNew]: string[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {
    const jsonModel = await this.getLastState();

    const update = {
      whitelistedProjectOwners: [
        ...jsonModel.whitelistedProjectOwners.filter((address) => address !== projectOwnerOld),
        projectOwnerNew,
      ],
      whitelist: { ...jsonModel.whitelist },
    };

    update.whitelist[projectOwnerNew] = update.whitelist[projectOwnerOld];
    delete update.whitelist[projectOwnerOld];

    await this.applyUpdateAndNotify(update, blockNumber, eventName);
  }

  async onChangedProjectNameEvent(
    session: ClientSession,
    [oldProjectName, newProjectName]: any[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {
    const jsonModel = this.getLastState();

    const update = {
      projects: [...jsonModel.projects.filter((name) => name !== oldProjectName), newProjectName],
    };

    await this.applyUpdateAndNotify(update, blockNumber, eventName);
  }

  async onAllocatedLTToProjectEvent(
    session: ClientSession,
    [contract, project]: any[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {
    const jsonModel = this.getLastState();

    const update = {
      projectRelatedToLT: {
        ...jsonModel.projectRelatedToLT,
        [contract]: project,
      },
    };

    await this.applyUpdateAndNotify(update, blockNumber, eventName);
  }

  async onAllocatedProjectOwnerToProjectEvent(
    session: ClientSession,
    [projectOwner, project]: any[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {
    const jsonModel = this.getLastState();

    const update = {
      whitelist: { ...jsonModel.whitelist, [projectOwner]: project },
    };

    await this.applyUpdateAndNotify(update, blockNumber, eventName);
  }
}
