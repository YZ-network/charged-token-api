import { EventFilter, ethers } from "ethers";
import { AbstractBlockchainRepository } from "../core/AbstractBlockchainRepository";
import { AbstractBroker } from "../core/AbstractBroker";
import { AbstractDbRepository } from "../core/AbstractDbRepository";
import { AbstractHandler } from "../core/AbstractHandler";
import { rootLogger } from "../rootLogger";
import { ClientSession, EMPTY_ADDRESS } from "../vendor";
import { EventListener } from "./EventListener";
import { ReorgDetector } from "./ReorgDetector";
import { contracts } from "./contracts";
import { detectNegativeAmount } from "./functions";
import { loadContract } from "./loaders";
import topicsMap from "./topics";

export class BlockchainRepository extends AbstractBlockchainRepository {
  private directory: string | undefined;
  private readonly chainId: number;
  private readonly provider: ethers.providers.JsonRpcProvider;
  private readonly db: AbstractDbRepository;
  private readonly broker: AbstractBroker;
  readonly eventListener: EventListener;
  private readonly log = rootLogger.child({ name: "BlockchainRepository" });

  readonly instances: Record<string, ethers.Contract> = {};
  private readonly interfaces: Record<string, ethers.utils.Interface> = {};
  readonly handlers: Record<string, AbstractHandler<any>> = {};

  readonly reorgDetector: ReorgDetector;

  constructor(
    chainId: number,
    provider: ethers.providers.JsonRpcProvider,
    db: AbstractDbRepository,
    broker: AbstractBroker,
    startEventLoop = true,
  ) {
    super();
    this.chainId = chainId;
    this.provider = provider;
    this.db = db;
    this.broker = broker;
    this.reorgDetector = new ReorgDetector(chainId, provider);
    this.eventListener = new EventListener(db, provider, startEventLoop);
  }

  get blockNumberBeforeDisconnect(): number {
    return this.reorgDetector.blockNumberBeforeDisconnect;
  }

  getInstance(dataType: DataType, address: string): ethers.Contract {
    if (this.instances[address] === undefined) {
      switch (dataType) {
        case "ChargedToken":
          this.instances[address] = new ethers.Contract(address, contracts.LiquidityToken.abi, this.provider);
          break;
        case "InterfaceProjectToken":
          this.instances[address] = new ethers.Contract(address, contracts.InterfaceProjectToken.abi, this.provider);
          break;
        case "Directory":
          this.instances[address] = new ethers.Contract(address, contracts.ContractsDirectory.abi, this.provider);
          break;
        case "DelegableToLT":
          this.instances[address] = new ethers.Contract(address, contracts.DelegableToLT.abi, this.provider);
          break;
        default:
          throw new Error(`Unhandled contract type : ${dataType}`);
      }
    }
    return this.instances[address];
  }

  getInterface(dataType: DataType): ethers.utils.Interface {
    if (this.interfaces[dataType] === undefined) {
      switch (dataType) {
        case "ChargedToken":
          this.interfaces[dataType] = new ethers.utils.Interface(contracts.LiquidityToken.abi);
          break;
        case "InterfaceProjectToken":
          this.interfaces[dataType] = new ethers.utils.Interface(contracts.InterfaceProjectToken.abi);
          break;
        case "Directory":
          this.interfaces[dataType] = new ethers.utils.Interface(contracts.ContractsDirectory.abi);
          break;
        case "DelegableToLT":
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

  async getUserBalance(address: string, user: string, session?: ClientSession): Promise<IUserBalance | null> {
    return await this.db.getBalance(this.chainId, address, user, session);
  }

  async getUserPTBalanceFromDb(ptAddress: string, user: string, session?: ClientSession): Promise<string | null> {
    return await this.db.getPTBalance(this.chainId, ptAddress, user, session);
  }

  async getUserBalancePT(ptAddress: string, user: string): Promise<string> {
    return (await this.getInstance("DelegableToLT", ptAddress).balanceOf(user)).toString();
  }

  async getChargedTokenFundraisingStatus(address: string): Promise<boolean> {
    return await this.getInstance("ChargedToken", address).isFundraisingActive();
  }

  async getProjectRelatedToLT(address: string, contract: string): Promise<string> {
    return await this.getInstance("Directory", address).projectRelatedToLT(contract);
  }

  async getUserLiquiToken(address: string, user: string): Promise<{ dateOfPartiallyCharged: number }> {
    return (await this.getInstance("ChargedToken", address).userLiquiToken(user)) as {
      dateOfPartiallyCharged: number;
    };
  }

  async loadUserBalances(
    blockNumber: number,
    user: string,
    ctAddress: string,
    interfaceAddress?: string,
    ptAddress?: string,
  ): Promise<IUserBalance> {
    this.log.info({
      chainId: this.chainId,
      msg: "Loading user balances",
      user,
      ctAddress,
      interfaceAddress,
      ptAddress,
    });

    const ctInstance = this.getInstance("ChargedToken", ctAddress);
    const ifaceInstance =
      interfaceAddress !== undefined ? this.getInstance("InterfaceProjectToken", interfaceAddress) : undefined;
    const ptInstance = ptAddress !== undefined ? this.getInstance("DelegableToLT", ptAddress) : undefined;

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
        ifaceInstance !== undefined ? (await ifaceInstance.valueProjectTokenToFullRecharge(user)).toString() : "0",
    };
  }

  async loadAndSyncEvents(
    dataType: DataType,
    address: string,
    startBlock: number,
    loader: AbstractHandler<any>,
  ): Promise<void> {
    let missedEvents: ethers.Event[] = [];

    let eventsFetchRetryCount = 0;
    while (eventsFetchRetryCount < 3) {
      try {
        missedEvents = await this.getFilteredMissedEvents(dataType, address, startBlock);
        break;
      } catch (err) {
        this.log.warn({
          chainId: this.chainId,
          address,
          contract: dataType,
          startBlock,
          msg: "Could not retrieve events from startBlock",
          err,
        });
        eventsFetchRetryCount++;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    if (eventsFetchRetryCount >= 3) {
      this.log.error({
        chainId: this.chainId,
        address,
        contract: dataType,
        startBlock,
        msg: "Error retrieving events from startBlock after 3 tries",
      });
      return;
    }

    if (missedEvents.length === 0) return;

    for (const event of missedEvents) {
      const name = event.event;

      if (name === undefined) {
        this.log.warn({
          chainId: this.chainId,
          address,
          contract: dataType,
          msg: "found unnamed event :",
          event,
        });
      } else {
        this.log.info({
          chainId: this.chainId,
          address,
          contract: dataType,
          msg: "delegating event processing",
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
      chainId: this.chainId,
      address,
      contract: dataType,
      fromBlock,
      msg: "Querying missed events",
    });

    const missedEvents = await this.loadEvents(dataType, address, fromBlock);

    if (missedEvents.length === 0) {
      this.log.info({
        chainId: this.chainId,
        address,
        contract: dataType,
        msg: "No events missed",
      });
      return [];
    }

    this.log.info({
      chainId: this.chainId,
      address,
      contract: dataType,
      msg: "Found potentially missed events",
      missedEventsCount: missedEvents.length,
    });

    const filteredEvents: ethers.Event[] = await this.removeKnownEvents(missedEvents);

    if (missedEvents.length > filteredEvents.length) {
      this.log.info({
        chainId: this.chainId,
        address,
        contract: dataType,
        msg: "Skipped events already played",
        skippedEventsCount: missedEvents.length - filteredEvents.length,
      });
    }

    if (filteredEvents.length > 0) {
      this.log.info({
        chainId: this.chainId,
        address,
        contract: dataType,
        msg: "Found really missed events",
        missedEventsCount: filteredEvents.length,
        missedEvents,
      });
    }

    return filteredEvents;
  }

  private async loadEvents(dataType: DataType, address: string, startBlock: number): Promise<ethers.Event[]> {
    const eventFilter: EventFilter = {
      address,
    };

    const instance = this.getInstance(dataType, address);

    return await instance.queryFilter(eventFilter, startBlock);
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

  subscribeToEvents(dataType: DataType, address: string, loader: AbstractHandler<any>): void {
    const eventFilter: EventFilter = {
      address,
    };

    const instance = this.getInstance(dataType, address);

    instance.on(eventFilter, (log: ethers.providers.Log) => {
      const eventName = topicsMap[dataType][log.topics[0]];

      this.eventListener.queueLog(eventName, log, loader, this.getInterface(dataType)).catch((err) => {
        this.log.error({
          chainId: this.chainId,
          address,
          contract: this.constructor.name,
          eventName,
          msg: "error queuing event",
          err,
          log,
        });
      });
    });
  }

  unsubscribeEvents(address: string): void {
    if (this.instances[address] !== undefined) {
      this.instances[address].removeAllListeners();
      delete this.instances[address];
    }
  }

  async registerContract<T extends IContract>(
    dataType: DataType,
    address: string,
    blockNumber: number,
    loader: AbstractHandler<T>,
    session?: ClientSession,
  ): Promise<T> {
    if (dataType === "Directory") {
      if (this.directory !== undefined) {
        throw new Error("ContractsDirectory already registered !");
      }
      this.directory = address;
    }

    if (this.isContractRegistered(address)) {
      throw new Error("Duplicate contract registration !");
    }

    this.handlers[address] = loader;

    let lastState = await this.db.get<T>(dataType, this.chainId, address, session);

    if (lastState != null) {
      this.log.info({
        chainId: this.chainId,
        address,
        contract: dataType,
        msg: "Found existing data for contract",
        lastUpdateBlock: lastState.lastUpdateBlock,
      });

      const eventsStartBlock = Math.max(
        lastState.lastUpdateBlock, // last update block should be included in case of partial events handling
        blockNumber - 100, // otherwise, limit the number of past blocks to query
      );

      if (eventsStartBlock > lastState.lastUpdateBlock) {
        this.log.warn({
          chainId: this.chainId,
          address,
          contract: dataType,
          msg: "Skipped blocks for events syncing",
          lastUpdateBlock: lastState.lastUpdateBlock,
          eventsStartBlock,
        });
      }

      await this.loadAndSyncEvents(dataType, address, eventsStartBlock, this.handlers[address]);
    } else {
      this.log.info({
        chainId: this.chainId,
        address,
        contract: dataType,
        msg: "First time loading",
      });

      const data = await loadContract<T>(
        this.chainId,
        dataType,
        this.getInstance(dataType, address),
        address,
        blockNumber,
      );
      lastState = await this.db.save<T>(dataType, data, session);

      this.broker.notifyUpdate(dataType, this.chainId, address, lastState);
    }

    this.subscribeToEvents(dataType, address, loader);

    return lastState;
  }

  async unregisterContract(
    dataType: DataType,
    address: string,
    remove = false,
    session?: ClientSession,
  ): Promise<void> {
    const lastState = await this.getLastState(dataType, address, session);

    this.unsubscribeEvents(address);
    delete this.handlers[address];
    if (remove) {
      await this.db.delete(dataType, this.chainId, address, session);
    }

    switch (dataType) {
      case "ChargedToken":
        if (remove) {
          await this.db.delete("UserBalance", this.chainId, address, session);
        }
        const interfaceAddress = (lastState as IChargedToken).interfaceProjectToken;
        if (interfaceAddress !== EMPTY_ADDRESS) {
          await this.unregisterContract("InterfaceProjectToken", interfaceAddress, remove, session);
        }
        break;

      case "InterfaceProjectToken":
        const ptAddress = (lastState as IInterfaceProjectToken).projectToken;
        if (ptAddress !== EMPTY_ADDRESS && !(await this.isDelegableStillReferenced(ptAddress))) {
          await this.unregisterContract("DelegableToLT", ptAddress, remove, session);
        }
        break;
    }
  }

  async getLastState<T>(dataType: DataType, address: string, session?: ClientSession): Promise<T | null> {
    return await this.db.get<T>(dataType, this.chainId, address, session);
  }

  isContractRegistered(address: string): boolean {
    return this.handlers[address] !== undefined;
  }

  async isDelegableStillReferenced(address: string): Promise<boolean> {
    return await this.db.isDelegableStillReferenced(this.chainId, address);
  }

  async loadAllUserBalances(user: string, blockNumber: number, address?: string): Promise<IUserBalance[]> {
    if (this.directory === undefined) {
      this.log.warn({ chainId: this.chainId, msg: "Tried to load balances before directory set" });
      return [];
    }

    this.log.info({
      chainId: this.chainId,
      msg: "Loading user balances",
      user,
      address,
    });

    const startDate = new Date().getTime();

    const lastDirectory = await this.getLastState<IDirectory>("Directory", this.directory);
    if (lastDirectory === null) {
      throw new Error("No directory");
    }

    const results: IUserBalance[] = [];
    for (const ctAddress of lastDirectory.directory) {
      const lastCt = await this.getLastState<IChargedToken>("ChargedToken", ctAddress);
      let interfaceAddress: string | undefined;
      let ptAddress: string | undefined;

      if (lastCt === null) throw new Error("Charged token not found !");

      if (lastCt.interfaceProjectToken !== EMPTY_ADDRESS) {
        interfaceAddress = lastCt.interfaceProjectToken;

        const lastInterface = await this.getLastState<IInterfaceProjectToken>(
          "InterfaceProjectToken",
          interfaceAddress,
        );

        if (lastInterface !== null && lastInterface.projectToken !== EMPTY_ADDRESS) {
          ptAddress = lastInterface.projectToken;
        }
      }

      const balance = await this.loadUserBalances(blockNumber, user, ctAddress, interfaceAddress, ptAddress);
      results.push(balance);
    }

    for (const entry of results) {
      if (await this.db.existsBalance(this.chainId, entry.address, user)) {
        this.log.info({
          chainId: this.chainId,
          address: entry.address,
          msg: "updating CT balance",
          user,
          balance: entry,
        });
        await this.db.updateBalance({ ...entry, chainId: this.chainId, user, address: entry.address });
      } else {
        await this.db.saveBalance(entry);
      }
    }

    const saved = await this.db.getBalances(this.chainId, user);

    if (saved !== null) {
      this.log.info({
        chainId: this.chainId,
        address,
        msg: "Publishing updated user balances",
        user,
      });

      this.broker.notifyUpdate("UserBalance", this.chainId, user, saved);
    } else {
      this.log.warn({
        chainId: this.chainId,
        address,
        msg: "Error while reloading balances after save",
        user,
      });
    }
    const stopDate = new Date().getTime();

    this.log.debug({
      chainId: this.chainId,
      address,
      msg: "User balances loaded",
      loadDurationSeconds: (stopDate - startDate) / 1000,
    });

    return results;
  }

  private async saveOrUpdate<T extends IContract>(
    address: string,
    dataType: DataType,
    data: Partial<T> | T,
    blockNumber: number,
    session?: ClientSession,
  ): Promise<void> {
    this.checkUpdateAmounts<T>(dataType, data);

    if (await this.db.exists(dataType, this.chainId, address, session)) {
      await this.db.update(
        dataType,
        {
          ...data,
          chainId: this.chainId,
          address,
          lastUpdateBlock: blockNumber,
        },
        session,
      );
    } else {
      await this.db.save(dataType, data as T, session);
    }
  }

  checkUpdateAmounts<T>(dataType: DataType, data: Partial<T> | T): void {
    let fieldsToCheck: string[];

    switch (dataType) {
      case "ChargedToken":
        fieldsToCheck = [
          "totalSupply",
          "maxInitialTokenAllocation",
          "maxStakingTokenAmount",
          "currentRewardPerShare1e18",
          "stakedLT",
          "totalLocked",
          "totalTokenAllocated",
          "campaignStakingRewards",
          "totalStakingRewards",
        ];
        break;

      case "DelegableToLT":
        fieldsToCheck = ["totalSupply"];
        break;

      case "UserBalance":
        fieldsToCheck = [
          "balance",
          "balancePT",
          "fullyChargedBalance",
          "partiallyChargedBalance",
          "claimedRewardPerShare1e18",
          "valueProjectTokenToFullRecharge",
        ];
        break;

      default:
        fieldsToCheck = [];
    }

    if (fieldsToCheck.length > 0) {
      detectNegativeAmount(this.chainId, dataType, data as Record<string, string>, fieldsToCheck);
    }
  }

  async setProjectTokenAddressOnBalances(
    address: string,
    ptAddress: string,
    blockNumber: number,
    session?: ClientSession,
  ): Promise<void> {
    this.log.info({
      chainId: this.chainId,
      address,
      ptAddress,
      msg: "will update PT address on balances for all users one by one",
    });

    const balancesToUpdate = await this.db.getBalancesByContract(this.chainId, address, session);
    this.log.info({
      chainId: this.chainId,
      address,
      msg: "user balances to update !",
      count: balancesToUpdate.length,
      users: balancesToUpdate.map((balance) => balance.user),
    });

    const userPTBalances: Record<string, string> = {};

    for (const balance of balancesToUpdate) {
      if (userPTBalances[balance.user] === undefined) {
        userPTBalances[balance.user] = await this.getUserBalancePT(ptAddress, balance.user);
        this.log.info({
          chainId: this.chainId,
          ptAddress,
          msg: "loaded user PT balance",
          user: balance.user,
          balance: balance.balancePT,
        });
      }

      await this.updateBalanceAndNotify(
        address,
        balance.user,
        {
          ptAddress,
          balancePT: userPTBalances[balance.user],
        },
        blockNumber,
        undefined,
        undefined,
        session,
      );
    }
  }

  async updateBalanceAndNotify(
    address: string,
    user: string,
    balanceUpdates: Partial<IUserBalance>,
    blockNumber: number,
    ptAddress?: string,
    eventName?: string,
    session?: ClientSession,
  ): Promise<void> {
    this.checkUpdateAmounts("UserBalance", balanceUpdates);

    this.log.info({
      chainId: this.chainId,
      address,
      msg: "applying update to balance",
      user,
      balanceUpdates,
      eventName,
    });

    await this.db.updateBalance(
      {
        ...balanceUpdates,
        chainId: this.chainId,
        address,
        user,
        lastUpdateBlock: blockNumber,
      },
      session,
    );

    if (balanceUpdates.balancePT !== undefined && ptAddress !== undefined) {
      this.log.info({
        chainId: this.chainId,
        ptAddress,
        msg: "propagating project token balance",
        user,
        eventName,
      });

      await this.db.updateOtherBalancesByProjectToken(
        address,
        {
          chainId: this.chainId,
          user,
          ptAddress,
          balancePT: balanceUpdates.balancePT,
          lastUpdateBlock: blockNumber,
        },
        session,
      );
    }

    if (ptAddress === undefined) {
      const newBalance = await this.db.getBalance(this.chainId, address, user, session);

      this.log.trace({
        chainId: this.chainId,
        address,
        msg: "sending balance update :",
        user,
        data: newBalance,
      });

      this.broker.notifyUpdate("UserBalance", this.chainId, user, [newBalance]);
    } else {
      await this.notifyBalancesUpdateByProjectToken(ptAddress, user, session);
    }
  }

  async updatePTBalanceAndNotify(
    ptAddress: string,
    user: string,
    balanceUpdates: Pick<IUserBalance, "balancePT">,
    blockNumber: number,
    eventName?: string,
    session?: ClientSession,
  ): Promise<void> {
    this.checkUpdateAmounts("UserBalance", balanceUpdates);

    this.log.info({
      chainId: this.chainId,
      ptAddress,
      msg: "applying update to PT balances",
      user,
      balanceUpdates,
      eventName,
    });

    await this.db.updatePTBalances(
      {
        ...balanceUpdates,
        ptAddress,
        chainId: this.chainId,
        user,
        lastUpdateBlock: blockNumber,
      },
      session,
    );

    await this.notifyBalancesUpdateByProjectToken(ptAddress, user, session);
  }

  async notifyBalancesUpdateByProjectToken(ptAddress: string, user: string, session?: ClientSession): Promise<void> {
    const updatedBalances = await this.db.getBalancesByProjectToken(this.chainId, ptAddress, user, session);

    this.log.trace({
      chainId: this.chainId,
      ptAddress,
      msg: "sending multiple balance updates :",
      data: updatedBalances,
    });

    for (const b of updatedBalances) {
      this.broker.notifyUpdate("UserBalance", this.chainId, user, [b]);
    }
  }

  async applyUpdateAndNotify(
    dataType: DataType,
    address: string,
    data: Partial<IContract>,
    blockNumber: number,
    eventName?: string,
    session?: ClientSession,
  ): Promise<void> {
    this.log.info({
      chainId: this.chainId,
      address,
      contract: dataType,
      msg: "applying update to contract",
      eventName,
      data,
    });

    await this.saveOrUpdate(address, dataType, data, blockNumber, session);

    const lastState = await this.getLastState(dataType, address, session);

    this.log.debug({
      chainId: this.chainId,
      address,
      contract: dataType,
      msg: "sending update to channel",
      data: lastState,
    });

    this.broker.notifyUpdate(dataType, this.chainId, address, lastState);
  }

  destroy(): void {
    Object.values(this.instances).forEach((instance) => instance.removeAllListeners);

    this.eventListener.destroy();
    this.reorgDetector.destroy();
  }
}
