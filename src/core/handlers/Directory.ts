import { type ClientSession } from "../../vendor";
import { AbstractBlockchainRepository } from "../AbstractBlockchainRepository";
import { AbstractHandler } from "../AbstractHandler";

export class Directory extends AbstractHandler<IDirectory> {
  constructor(
    chainId: number,
    blockchain: AbstractBlockchainRepository,
    address: string,
    loaderFactory: (
      dataType: DataType,
      chainId: number,
      address: string,
      blockchain: AbstractBlockchainRepository,
    ) => AbstractHandler<any>,
  ) {
    super(chainId, blockchain, address, "Directory", loaderFactory);
  }

  async onUserFunctionsAreDisabledEvent(
    session: ClientSession,
    [areUserFunctionsDisabled]: any[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {
    await this.applyUpdateAndNotify({ areUserFunctionsDisabled }, blockNumber, eventName, session);
  }

  async onProjectOwnerWhitelistedEvent(
    session: ClientSession,
    [projectOwner, project]: any[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {
    const jsonModel = await this.getLastState(session);

    const updates = {
      projects: [...jsonModel.projects, project],
      whitelistedProjectOwners: [...jsonModel.whitelistedProjectOwners, projectOwner],
      whitelist: { ...jsonModel.whitelist, [projectOwner]: project },
    };

    await this.applyUpdateAndNotify(updates, blockNumber, eventName, session);
  }

  async onAddedLTContractEvent(
    session: ClientSession,
    [contract]: any[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {
    const jsonModel = await this.getLastState(session);

    const updates = {
      directory: [...jsonModel.directory, contract],
      projectRelatedToLT: {
        ...jsonModel.projectRelatedToLT,
        [contract]: await this.blockchain.getProjectRelatedToLT(this.address, contract),
      },
    };

    await this.blockchain.registerContract(
      "ChargedToken",
      contract,
      blockNumber,
      this.loaderFactory("ChargedToken", this.chainId, contract, this.blockchain),
    );

    await this.applyUpdateAndNotify(updates, blockNumber, eventName, session);
  }

  async onRemovedLTContractEvent(
    session: ClientSession,
    [contract]: any[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {
    const jsonModel = await this.getLastState(session);

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

    await this.blockchain.unregisterContract("ChargedToken", contract, true, session);

    await this.applyUpdateAndNotify(update, blockNumber, eventName, session);
  }

  async onRemovedProjectByAdminEvent(
    session: ClientSession,
    [projectOwner]: any[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {
    const jsonModel = await this.getLastState(session);

    const update = {
      projects: jsonModel.projects.filter((_, index) => jsonModel.whitelistedProjectOwners[index] !== projectOwner),
      whitelistedProjectOwners: jsonModel.whitelistedProjectOwners.filter((address) => address !== projectOwner),
      whitelist: { ...jsonModel.whitelist },
    };

    delete update.whitelist[projectOwner];

    await this.applyUpdateAndNotify(update, blockNumber, eventName, session);
  }

  async onChangedProjectOwnerAccountEvent(
    session: ClientSession,
    [projectOwnerOld, projectOwnerNew]: string[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {
    const jsonModel = await this.getLastState(session);

    const update = {
      whitelistedProjectOwners: [
        ...jsonModel.whitelistedProjectOwners.filter((address) => address !== projectOwnerOld),
        projectOwnerNew,
      ],
      whitelist: { ...jsonModel.whitelist },
    };

    update.whitelist[projectOwnerNew] = update.whitelist[projectOwnerOld];
    delete update.whitelist[projectOwnerOld];

    await this.applyUpdateAndNotify(update, blockNumber, eventName, session);
  }

  async onChangedProjectNameEvent(
    session: ClientSession,
    [oldProjectName, newProjectName]: any[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {
    const jsonModel = await this.getLastState(session);

    const update = {
      projects: [...jsonModel.projects.filter((name) => name !== oldProjectName), newProjectName],
    };

    await this.applyUpdateAndNotify(update, blockNumber, eventName, session);
  }

  async onAllocatedLTToProjectEvent(
    session: ClientSession,
    [contract, project]: any[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {
    const jsonModel = await this.getLastState(session);

    const update = {
      projectRelatedToLT: {
        ...jsonModel.projectRelatedToLT,
        [contract]: project,
      },
    };

    await this.applyUpdateAndNotify(update, blockNumber, eventName, session);
  }

  async onAllocatedProjectOwnerToProjectEvent(
    session: ClientSession,
    [projectOwner, project]: any[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {
    const jsonModel = await this.getLastState(session);

    const update = {
      whitelist: { ...jsonModel.whitelist, [projectOwner]: project },
    };

    await this.applyUpdateAndNotify(update, blockNumber, eventName, session);
  }
}
