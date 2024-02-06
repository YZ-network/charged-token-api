import { EventFilter, ethers } from "ethers";
import { contracts } from "../contracts";
import {
  AbstractBlockchainRepository,
  AbstractDbRepository,
  AbstractLoader,
  DataType,
  EMPTY_ADDRESS,
  IChargedToken,
  IDelegableToLT,
  IDirectory,
  IInterfaceProjectToken,
  IUserBalance,
} from "../loaders";
import { rootLogger } from "../rootLogger";
import topicsMap from "../topics";
import { EventListener } from "./EventListener";

export class BlockchainRepository extends AbstractBlockchainRepository {
  private readonly chainId: number;
  private readonly provider: ethers.providers.JsonRpcProvider;
  private readonly db: AbstractDbRepository;
  private readonly eventListener: EventListener;
  private readonly log = rootLogger.child({ name: "BlockchainRepository" });

  private readonly instances: Record<string, ethers.Contract> = {};
  private readonly interfaces: Record<string, ethers.utils.Interface> = {};

  constructor(
    chainId: number,
    provider: ethers.providers.JsonRpcProvider,
    db: AbstractDbRepository,
    startEventLoop = true,
  ) {
    super();
    this.chainId = chainId;
    this.provider = provider;
    this.db = db;
    this.eventListener = new EventListener(db, provider, startEventLoop);
  }

  private getInstance(dataType: DataType, address: string): ethers.Contract {
    if (this.instances[address] === undefined) {
      switch (dataType) {
        case DataType.ChargedToken:
          this.instances[address] = new ethers.Contract(address, contracts.LiquidityToken.abi, this.provider);
          break;
        case DataType.InterfaceProjectToken:
          this.instances[address] = new ethers.Contract(address, contracts.InterfaceProjectToken.abi, this.provider);
          break;
        case DataType.Directory:
          this.instances[address] = new ethers.Contract(address, contracts.ContractsDirectory.abi, this.provider);
          break;
        case DataType.DelegableToLT:
          this.instances[address] = new ethers.Contract(address, contracts.DelegableToLT.abi, this.provider);
          break;
        default:
          throw new Error(`Unhandled contract type : ${dataType}`);
      }
    }
    return this.instances[address];
  }

  private getInterface(dataType: DataType): ethers.utils.Interface {
    if (this.interfaces[dataType] === undefined) {
      switch (dataType) {
        case DataType.ChargedToken:
          this.interfaces[dataType] = new ethers.utils.Interface(contracts.LiquidityToken.abi);
          break;
        case DataType.InterfaceProjectToken:
          this.interfaces[dataType] = new ethers.utils.Interface(contracts.InterfaceProjectToken.abi);
          break;
        case DataType.Directory:
          this.interfaces[dataType] = new ethers.utils.Interface(contracts.ContractsDirectory.abi);
          break;
        case DataType.DelegableToLT:
          this.interfaces[dataType] = new ethers.utils.Interface(contracts.DelegableToLT.abi);
          break;
        default:
          throw new Error(`Unhandled contract type : ${dataType}`);
      }
    }
    return this.interfaces[dataType];
  }

  async getBlockNumber(): Promise<number> {
    return await this.provider.getBlockNumber();
  }

  async loadDirectory(address: string, blockNumber: number): Promise<IDirectory> {
    const ins = this.getInstance(DataType.Directory, address);

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
      address,
      owner: await ins.owner(),
      directory,
      whitelistedProjectOwners,
      projects,
      projectRelatedToLT,
      whitelist,
      areUserFunctionsDisabled: await ins.areUserFunctionsDisabled(),
    };
  }

  async loadChargedToken(address: string, blockNumber: number): Promise<IChargedToken> {
    const ins = this.getInstance(DataType.ChargedToken, address);

    const fundraisingFields = {
      isFundraisingContract: false,
      fundraisingTokenSymbol: "",
      priceTokenPer1e18: "0",
      fundraisingToken: EMPTY_ADDRESS,
      isFundraisingActive: false,
    };

    try {
      fundraisingFields.isFundraisingActive = await ins.isFundraisingActive();
      fundraisingFields.fundraisingTokenSymbol = (await ins.fundraisingTokenSymbol()).toString();
      fundraisingFields.priceTokenPer1e18 = (await ins.priceTokenPer1e18()).toString();
      fundraisingFields.fundraisingToken = (await ins.fundraisingToken()).toString();
      fundraisingFields.isFundraisingContract = true;
    } catch (err) {}

    return {
      // contract
      chainId: this.chainId,
      lastUpdateBlock: blockNumber,
      address,
      // ownable
      owner: await ins.owner(),
      // erc20
      name: await ins.name(),
      symbol: await ins.symbol(),
      decimals: (await ins.decimals()).toString(),
      totalSupply: (await ins.totalSupply()).toString(),
      // constants
      fractionInitialUnlockPerThousand: (await ins.fractionInitialUnlockPerThousand()).toString(),
      durationCliff: (await ins.durationCliff()).toString(),
      durationLinearVesting: (await ins.durationLinearVesting()).toString(),
      maxInitialTokenAllocation: (await ins.maxInitialTokenAllocation()).toString(),
      maxWithdrawFeesPerThousandForLT: (await ins.maxWithdrawFeesPerThousandForLT()).toString(),
      maxClaimFeesPerThousandForPT: (await ins.maxClaimFeesPerThousandForPT()).toString(),
      maxStakingAPR: (await ins.maxStakingAPR()).toString(),
      maxStakingTokenAmount: (await ins.maxStakingTokenAmount()).toString(),
      // toggles
      areUserFunctionsDisabled: await ins.areUserFunctionsDisabled(),
      isInterfaceProjectTokenLocked: await ins.isInterfaceProjectTokenLocked(),
      areAllocationsTerminated: await ins.areAllocationsTerminated(),
      // variables
      interfaceProjectToken: await ins.interfaceProjectToken(),
      ratioFeesToRewardHodlersPerThousand: (await ins.ratioFeesToRewardHodlersPerThousand()).toString(),
      currentRewardPerShare1e18: (await ins.currentRewardPerShare1e18()).toString(),
      stakedLT: (await ins.stakedLT()).toString(),
      totalLocked: (await ins.balanceOf(address)).toString(),
      totalTokenAllocated: (await ins.totalTokenAllocated()).toString(),
      withdrawFeesPerThousandForLT: (await ins.withdrawFeesPerThousandForLT()).toString(),
      // staking
      stakingStartDate: (await ins.stakingStartDate()).toString(),
      stakingDuration: (await ins.stakingDuration()).toString(),
      stakingDateLastCheckpoint: (await ins.stakingDateLastCheckpoint()).toString(),
      campaignStakingRewards: (await ins.campaignStakingRewards()).toString(),
      totalStakingRewards: (await ins.totalStakingRewards()).toString(),
      // fundraising
      ...fundraisingFields,
    };
  }

  async getUserBalancePT(ptAddress: string, user: string): Promise<string> {
    return (await this.getInstance(DataType.DelegableToLT, ptAddress).balanceOf(user)).toString();
  }

  async getChargedTokenFundraisingStatus(address: string): Promise<boolean> {
    return await this.getInstance(DataType.ChargedToken, address).isFundraisingActive();
  }

  async getProjectRelatedToLT(address: string, contract: string): Promise<string> {
    return await this.getInstance(DataType.Directory, address).projectRelatedToLT(contract);
  }

  async getUserLiquiToken(address: string, user: string): Promise<{ dateOfPartiallyCharged: number }> {
    return (await this.getInstance(DataType.ChargedToken, address).userLiquiToken(user)) as {
      dateOfPartiallyCharged: number;
    };
  }

  async loadInterfaceProjectToken(address: string, blockNumber: number): Promise<IInterfaceProjectToken> {
    const ins = this.getInstance(DataType.InterfaceProjectToken, address);

    return {
      // contract
      chainId: this.chainId,
      lastUpdateBlock: blockNumber,
      address,
      // ownable
      owner: await ins.owner(),
      // other
      liquidityToken: await ins.liquidityToken(),
      projectToken: await ins.projectToken(),
      dateLaunch: (await ins.dateLaunch()).toString(),
      dateEndCliff: (await ins.dateEndCliff()).toString(),
      claimFeesPerThousandForPT: (await ins.claimFeesPerThousandForPT()).toString(),
    };
  }

  async loadDelegableToLT(address: string, blockNumber: number): Promise<IDelegableToLT> {
    const ins = this.getInstance(DataType.DelegableToLT, address);

    const validatedInterfaceProjectToken: string[] = [];
    const validatedInterfaceCount = (await ins.countValidatedInterfaceProjectToken()).toNumber();
    for (let i = 0; i < validatedInterfaceCount; i++) {
      validatedInterfaceProjectToken.push(await ins.getValidatedInterfaceProjectToken(i));
    }

    return {
      // contract
      chainId: this.chainId,
      lastUpdateBlock: blockNumber,
      address,
      // ownable
      owner: await ins.owner(),
      // erc20
      name: await ins.name(),
      symbol: await ins.symbol(),
      decimals: (await ins.decimals()).toString(),
      totalSupply: (await ins.totalSupply()).toString(),
      // other
      validatedInterfaceProjectToken,
      isListOfInterfaceProjectTokenComplete: await ins.isListOfInterfaceProjectTokenComplete(),
    };
  }

  async loadUserBalances(
    blockNumber: number,
    user: string,
    ctAddress: string,
    interfaceAddress?: string,
    ptAddress?: string,
  ): Promise<IUserBalance> {
    const ctInstance = this.getInstance(DataType.ChargedToken, ctAddress);
    const ifaceInstance =
      interfaceAddress !== undefined ? this.getInstance(DataType.InterfaceProjectToken, interfaceAddress) : undefined;
    const ptInstance = ptAddress !== undefined ? this.getInstance(DataType.DelegableToLT, ptAddress) : undefined;

    const balance = (await ctInstance.balanceOf(user)).toString();
    const fullyChargedBalance = (await ctInstance.getUserFullyChargedBalanceLiquiToken(user)).toString();
    const partiallyChargedBalance = (await ctInstance.getUserPartiallyChargedBalanceLiquiToken(user)).toString();

    return {
      chainId: this.chainId,
      user,
      address: ctAddress,
      ptAddress: ptAddress || "",
      lastUpdateBlock: blockNumber,
      balance,
      balancePT: ptInstance !== undefined ? (await ptInstance.balanceOf(user)).toString() : "0",
      fullyChargedBalance,
      partiallyChargedBalance,
      dateOfPartiallyCharged: (await ctInstance.getUserDateOfPartiallyChargedToken(user)).toString(),
      claimedRewardPerShare1e18: (await ctInstance.claimedRewardPerShare1e18(user)).toString(),
      valueProjectTokenToFullRecharge:
        ifaceInstance !== undefined ? (await ifaceInstance.loadValueProjectTokenToFullRecharge(user)).toString() : "0",
    };
  }

  async loadAndSyncEvents(
    dataType: DataType,
    address: string,
    startBlock: number,
    loader: AbstractLoader<any>,
  ): Promise<void> {
    let missedEvents: ethers.Event[] = [];

    let eventsFetchRetryCount = 0;
    while (eventsFetchRetryCount < 3) {
      try {
        missedEvents = await this.getFilteredMissedEvents(dataType, address, startBlock);
        break;
      } catch (err) {
        this.log.warn({
          msg: `Could not retrieve events from block ${startBlock}`,
          err,
          contract: dataType,
          address,
          chainId: this.chainId,
        });
        eventsFetchRetryCount++;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    if (eventsFetchRetryCount >= 3) {
      this.log.error({
        msg: `Error retrieving events from block ${startBlock} after 3 tries`,
        contract: dataType,
        address,
        chainId: this.chainId,
      });
      return;
    }

    if (missedEvents.length === 0) return;

    for (const event of missedEvents) {
      const name = event.event;

      if (name === undefined) {
        this.log.warn({
          msg: "found unnamed event :",
          event,
          contract: dataType,
          address,
          chainId: this.chainId,
        });
      } else {
        this.log.info({
          msg: "delegating event processing",
          contract: dataType,
          address,
          chainId: this.chainId,
        });

        await this.eventListener.queueLog(name, event, loader, this.getInterface(dataType));
      }
    }
  }

  private async getFilteredMissedEvents(
    dataType: DataType,
    address: string,
    fromBlock: number,
  ): Promise<ethers.Event[]> {
    this.log.info({
      msg: `Querying missed events from block ${fromBlock}`,
      contract: dataType,
      address,
      chainId: this.chainId,
    });

    const missedEvents = await this.loadEvents(dataType, address, fromBlock);

    if (missedEvents.length === 0) {
      this.log.info({
        msg: "No events missed",
        contract: dataType,
        address,
        chainId: this.chainId,
      });
      return [];
    }

    this.log.info({
      msg: `Found ${missedEvents.length} potentially missed events`,
      contract: dataType,
      address,
      chainId: this.chainId,
    });

    const filteredEvents: ethers.Event[] = await this.removeKnownEvents(missedEvents);

    if (missedEvents.length > filteredEvents.length) {
      this.log.info({
        msg: `Skipped ${missedEvents.length - filteredEvents.length} events already played`,
        contract: dataType,
        address,
        chainId: this.chainId,
      });
    }

    if (filteredEvents.length > 0) {
      this.log.info({
        msg: `Found ${filteredEvents.length} really missed events`,
        // missedEvents,
        contract: dataType,
        address,
        chainId: this.chainId,
      });
    }

    return filteredEvents;
  }

  private async loadEvents(dataType: DataType, address: string, startBlock: number): Promise<ethers.Event[]> {
    const eventFilter: EventFilter = {
      address,
    };

    const instance = this.getInstance(dataType, address);

    const events = await instance.queryFilter(eventFilter, startBlock);

    if (events === null) {
      this.log.warn({
        msg: `Events querying returned null since block ${startBlock}`,
        contract: dataType,
        address,
        chainId: this.chainId,
      });
      return [] as ethers.Event[];
    } else if (events.length === 0) {
      this.log.info({
        msg: "No events missed",
        contract: dataType,
        address,
        chainId: this.chainId,
      });
      return [] as ethers.Event[];
    }

    return events;
  }

  private async removeKnownEvents(events: ethers.Event[]): Promise<ethers.Event[]> {
    const filteredEvents: ethers.Event[] = [];
    for (const event of events) {
      if (
        !(await this.db.existsEvent(
          this.chainId,
          event.address,
          event.blockNumber,
          event.transactionIndex,
          event.logIndex,
        ))
      ) {
        filteredEvents.push(event);
      }
    }

    return filteredEvents;
  }

  subscribeToEvents(dataType: DataType, address: string, loader: AbstractLoader<any>): void {
    const eventFilter: EventFilter = {
      address,
    };

    const instance = this.getInstance(dataType, address);

    instance.on(eventFilter, (log: ethers.providers.Log) => {
      const eventName = topicsMap[this.constructor.name][log.topics[0]];

      this.eventListener.queueLog(eventName, log, loader, this.getInterface(dataType)).catch((err) => {
        this.log.error({
          msg: `error queuing event ${eventName}`,
          err,
          log,
          contract: this.constructor.name,
          address,
          chainId: this.chainId,
        });
      });
    });
  }

  destroy(): void {
    Object.values(this.instances).forEach((instance) => instance.removeAllListeners);

    this.eventListener.destroy();
  }
}
