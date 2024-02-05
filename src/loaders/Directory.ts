import { ethers } from "ethers";
import { type ClientSession } from "mongodb";
import { contracts } from "../contracts";
import { type IDirectory, type IUserBalance } from "../models";
import pubSub from "../pubsub";
import { DataType, EMPTY_ADDRESS } from "../types";
import { AbstractDbRepository } from "./AbstractDbRepository";
import { AbstractLoader } from "./AbstractLoader";
import { ChargedToken } from "./ChargedToken";
import { type EventListener } from "./EventListener";
import { FundraisingChargedToken } from "./FundraisingChargedToken";
import { InterfaceProjectToken } from "./InterfaceProjectToken";

export class Directory extends AbstractLoader<IDirectory> {
  readonly ct: Record<string, ChargedToken | FundraisingChargedToken> = {};

  constructor(
    eventListener: EventListener,
    chainId: number,
    provider: ethers.providers.JsonRpcProvider,
    address: string,
    dbRepository: AbstractDbRepository,
  ) {
    super(eventListener, chainId, provider, address, contracts.ContractsDirectory, dbRepository);
  }

  async init(session: ClientSession, blockNumber: number, createTransaction?: boolean) {
    await super.init(session, blockNumber, createTransaction);

    for (const address of this.lastState!.directory) {
      this.ct[address] = await this.guessChargedTokenKindAndCreate(address);
    }

    for (const ct of Object.values(this.ct)) {
      await ct.init(session, blockNumber, createTransaction);
    }
  }

  private async guessChargedTokenKindAndCreate(address: string): Promise<ChargedToken | FundraisingChargedToken> {
    try {
      const instance = new ethers.Contract(address, contracts.LiquidityToken.abi, this.provider);
      await instance.isFundraisingActive();
      this.log.info({
        msg: "Detected Fundraising Contract",
        chainId: this.chainId,
        contract: this.contract.name,
        address,
      });
      return new FundraisingChargedToken(this.chainId, this.provider, address, this, this.db);
    } catch (err) {
      this.log.info({
        msg: "Detected old Charged Token Contract",
        chainId: this.chainId,
        contract: this.contract.name,
        address,
      });
      return new ChargedToken(this.chainId, this.provider, address, this, this.db);
    }
  }

  async load(blockNumber: number): Promise<IDirectory> {
    this.log.debug({
      msg: "Reading entire directory",
      chainId: this.chainId,
      contract: this.contract.name,
      address: this.address,
    });

    const ins = this.instance;

    const whitelistCount = (await ins.countWhitelistedProjectOwners()).toNumber();
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
      lastUpdateBlock: blockNumber,
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

  async loadAllUserBalances(
    session: ClientSession,
    user: string,
    blockNumber: number,
    address?: string,
  ): Promise<IUserBalance[]> {
    this.log.info({
      msg: `Loading user balances for ${user}@${address}`,
      chainId: this.chainId,
      contract: this.contract.name,
      address: this.address,
    });

    const startDate = new Date().getTime();

    const results =
      address === undefined || this.ct[address] === undefined
        ? await Promise.all(
            Object.values(this.ct).map(
              async (ct: ChargedToken | FundraisingChargedToken) => await ct.loadUserBalances(user, blockNumber),
            ),
          )
        : [await this.ct[address].loadUserBalances(user, blockNumber)];

    for (const entry of results) {
      if (await this.db.existsBalance(this.chainId, entry.address, user)) {
        this.log.info({
          msg: `updating CT balance for ${user}`,
          chainId: this.chainId,
          address: entry.address,
          balance: entry,
        });
        await this.db.updateBalance({ ...entry, chainId: this.chainId, user, address: entry.address });
      } else if (this.ct[entry.address] !== undefined) {
        const iface = this.ct[entry.address].interface;
        const ptAddress = iface?.projectToken !== undefined ? iface.projectToken.address : "";

        this.log.info({
          msg: `first time saving balance for ${user}`,
          chainId: this.chainId,
          contract: this.contract.name,
          address: entry.address,
          ptAddress,
        });
        await this.db.saveBalance(entry);
      }
    }

    const saved = await this.db.getBalances(this.chainId, user);

    if (saved !== null) {
      this.log.info({
        msg: `Publishing updated user balances for ${user}`,
        chainId: this.chainId,
        contract: this.contract.name,
        address: this.address,
      });

      pubSub.publish(`UserBalance.${this.chainId}.${user}`, saved);
    } else {
      this.log.warn({
        msg: `Error while reloading balances after save for user ${user}`,
        chainId: this.chainId,
        contract: this.contract.name,
        address: this.address,
      });
    }
    const stopDate = new Date().getTime();

    this.log.debug({
      msg: `User balances loaded in ${(stopDate - startDate) / 1000} seconds`,
      chainId: this.chainId,
      contract: this.contract.name,
      address: this.address,
    });

    return results;
  }

  async destroy() {
    await Promise.all(
      Object.values(this.ct).map(async (ct) => {
        await ct.destroy();
      }),
    );
    await super.destroy();
  }

  subscribeToEvents(): void {
    super.subscribeToEvents();
    Object.values(this.ct).forEach((ct) => {
      ct.subscribeToEvents();
    });
  }

  async onUserFunctionsAreDisabledEvent(
    session: ClientSession,
    [areUserFunctionsDisabled]: any[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {
    await this.applyUpdateAndNotify(session, { areUserFunctionsDisabled }, blockNumber, eventName);
  }

  async onProjectOwnerWhitelistedEvent(
    session: ClientSession,
    [projectOwner, project]: any[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {
    const jsonModel = await this.getJsonModel(session);

    const updates = {
      projects: [...jsonModel.projects, project],
      whitelistedProjectOwners: [...jsonModel.whitelistedProjectOwners, projectOwner],
      whitelist: { ...jsonModel.whitelist, [projectOwner]: project },
    };

    await this.applyUpdateAndNotify(session, updates, blockNumber, eventName);
  }

  async onAddedLTContractEvent(
    session: ClientSession,
    [contract]: any[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {
    const jsonModel = await this.getJsonModel(session);

    const updates = {
      directory: [...jsonModel.directory, contract],
      projectRelatedToLT: {
        ...jsonModel.projectRelatedToLT,
        [contract]: await this.instance.projectRelatedToLT(contract),
      },
    };

    this.ct[contract] = await this.guessChargedTokenKindAndCreate(contract);

    await this.ct[contract].init(session, blockNumber, false);
    this.ct[contract].subscribeToEvents();

    await this.applyUpdateAndNotify(session, updates, blockNumber, eventName);
  }

  async onRemovedLTContractEvent(
    session: ClientSession,
    [contract]: any[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {
    const jsonModel = await this.getJsonModel(session);

    const update = {
      directory: jsonModel.directory.filter((address) => address !== contract),
      projectRelatedToLT: Object.assign(
        {},
        ...Object.entries(jsonModel.projectRelatedToLT)
          .filter(([key]) => key !== contract)
          .map(([key, value]) => ({ [key]: value })),
      ),
    };

    const balanceAddressList: string[] = [];

    this.log.info({
      msg: "Removing charged token from directory and database",
      chainId: this.chainId,
      address: contract,
    });

    await this.ct[contract].destroy();

    delete this.ct[contract];
    this.db.delete(DataType.ChargedToken, this.chainId, contract);
    balanceAddressList.push(contract);

    const iface = await this.db.getInterfaceByChargedToken(this.chainId, contract);
    if (iface !== null) {
      this.log.info({
        msg: "Removing interface from database",
        chainId: this.chainId,
        address: iface.address,
      });

      balanceAddressList.push(iface.address);
      await this.db.delete(DataType.InterfaceProjectToken, this.chainId, iface.address);
      if (
        iface.projectToken !== EMPTY_ADDRESS &&
        InterfaceProjectToken.projectUsageCount[iface.projectToken] === undefined &&
        (await this.db.exists(DataType.DelegableToLT, this.chainId, iface.projectToken))
      ) {
        this.log.info({
          msg: "Removing project token from database",
          chainId: this.chainId,
          address: iface.projectToken,
          usageCount: InterfaceProjectToken.projectUsageCount[iface.projectToken],
        });

        await this.db.delete(DataType.DelegableToLT, this.chainId, iface.projectToken);
        balanceAddressList.push(iface.projectToken);
      }
    }

    this.log.info({
      msg: "Removing linked balances for charged token",
      chainId: this.chainId,
      balanceAddressList,
    });

    await this.db.delete(DataType.UserBalance, this.chainId, balanceAddressList);

    await this.applyUpdateAndNotify(session, update, blockNumber, eventName);
  }

  async onRemovedProjectByAdminEvent(
    session: ClientSession,
    [projectOwner]: any[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {
    const jsonModel = await this.getJsonModel(session);

    const update = {
      projects: jsonModel.projects.filter((_, index) => jsonModel.whitelistedProjectOwners[index] !== projectOwner),
      whitelistedProjectOwners: jsonModel.whitelistedProjectOwners.filter((address) => address !== projectOwner),
      whitelist: { ...jsonModel.whitelist },
    };

    delete update.whitelist[projectOwner];

    await this.applyUpdateAndNotify(session, update, blockNumber, eventName);
  }

  async onChangedProjectOwnerAccountEvent(
    session: ClientSession,
    [projectOwnerOld, projectOwnerNew]: string[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {
    const jsonModel = await this.getJsonModel(session);

    const update = {
      whitelistedProjectOwners: [
        ...jsonModel.whitelistedProjectOwners.filter((address) => address !== projectOwnerOld),
        projectOwnerNew,
      ],
      whitelist: { ...jsonModel.whitelist },
    };

    update.whitelist[projectOwnerNew] = update.whitelist[projectOwnerOld];
    delete update.whitelist[projectOwnerOld];

    await this.applyUpdateAndNotify(session, update, blockNumber, eventName);
  }

  async onChangedProjectNameEvent(
    session: ClientSession,
    [oldProjectName, newProjectName]: any[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {
    const jsonModel = await this.getJsonModel(session);

    const update = {
      projects: [...jsonModel.projects.filter((name) => name !== oldProjectName), newProjectName],
    };

    await this.applyUpdateAndNotify(session, update, blockNumber, eventName);
  }

  async onAllocatedLTToProjectEvent(
    session: ClientSession,
    [contract, project]: any[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {
    const jsonModel = await this.getJsonModel(session);

    const update = {
      projectRelatedToLT: {
        ...jsonModel.projectRelatedToLT,
        [contract]: project,
      },
    };

    await this.applyUpdateAndNotify(session, update, blockNumber, eventName);
  }

  async onAllocatedProjectOwnerToProjectEvent(
    session: ClientSession,
    [projectOwner, project]: any[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {
    const jsonModel = await this.getJsonModel(session);

    const update = {
      whitelist: { ...jsonModel.whitelist, [projectOwner]: project },
    };

    await this.applyUpdateAndNotify(session, update, blockNumber, eventName);
  }
}
