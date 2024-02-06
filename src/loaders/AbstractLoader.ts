import { BigNumber, ethers } from "ethers";
import { type ClientSession, type HydratedDocument } from "mongoose";
import { type Logger } from "pino";
import pubSub from "../pubsub";
import { IEventHandler } from "../types";
import { rootLogger } from "../util";
import { AbstractBlockchainRepository } from "./AbstractBlockchainRepository";
import { AbstractDbRepository } from "./AbstractDbRepository";
import { DataType, IOwnable, IUserBalance } from "./types";

/**
 * Generic contract loader. Used for loading initial contracts state, keeping
 * up with new block events and saving the result to database.
 *
 * When a document already exists, it will sync all events from the last checkpoint
 * to the latest block number before watching new blocks.
 */
export abstract class AbstractLoader<T extends IOwnable> {
  readonly chainId: number;
  readonly address: string;
  protected readonly dataType: DataType;
  readonly db: AbstractDbRepository;
  readonly log: Logger<{
    name: string;
  }>;

  protected readonly blockchain: AbstractBlockchainRepository;

  lastState: T | undefined;

  /**
   * @param provider ether provider.
   * @param address contract address.
   * @param contract contract abi.
   * @param model mongoose model for this contract.
   */
  protected constructor(
    chainId: number,
    blockchain: AbstractBlockchainRepository,
    address: string,
    db: AbstractDbRepository,
    dataType: DataType,
  ) {
    this.chainId = chainId;
    this.blockchain = blockchain;
    this.address = address;
    this.db = db;
    this.dataType = dataType;

    this.log = rootLogger.child({
      chainId,
      address,
      contract: this.constructor.name,
    });
  }

  /**
   * Call this method after creating a new instance in order to fetch the initial
   * contract state from the blockchain or existing one from database.
   *
   * After initialization, the contract is up to date and the loader is subscribed to events.
   */
  async init(session: ClientSession, blockNumber: number, createTransaction?: boolean): Promise<void> {
    const existing = await this.get(session);

    if (createTransaction === true) session.startTransaction();

    if (existing != null) {
      this.log.info({
        msg: "Found existing data for contract",
        contract: this.constructor.name,
        chainId: this.chainId,
        address: this.address,
        lastUpdateBlock: existing.lastUpdateBlock,
      });

      this.lastState = existing;

      const eventsStartBlock = Math.max(
        existing.lastUpdateBlock, // last update block should be included in case of partial events handling
        blockNumber - 100, // otherwise, limit the number of past blocks to query
      );

      if (eventsStartBlock > existing.lastUpdateBlock) {
        this.log.warn({
          msg: "Skipped blocks for events syncing",
          contract: this.constructor.name,
          address: this.address,
          chainId: this.chainId,
          lastUpdateBlock: existing.lastUpdateBlock,
          eventsStartBlock,
        });
      }

      await this.blockchain.loadAndSyncEvents(this.dataType, this.address, eventsStartBlock, this);
    } else {
      this.log.info({
        msg: "First time loading",
        contract: this.constructor.name,
        address: this.address,
        chainId: this.chainId,
      });
      await this.saveOrUpdate(session, await this.load(blockNumber), blockNumber);

      const contractName = this.constructor.name === "FundraisingChargedToken" ? "ChargedToken" : this.constructor.name;

      pubSub.publish(`${contractName}.${this.chainId}.${this.address}`, this.lastState);
      pubSub.publish(`${contractName}.${this.chainId}`, this.lastState);
    }

    if (createTransaction === true) await session.commitTransaction();
  }

  /**
   * Contract state full loading from blockchain method.
   */
  abstract load(blockNumber: number): Promise<T>;

  /** Checks for contract state in the database. */
  async exists(): Promise<boolean> {
    return await this.db.exists(this.dataType, this.chainId, this.address);
  }

  /** Returns contract state from the database or null. */
  async get(session: ClientSession): Promise<T | null> {
    return await this.db.get(this.dataType, this.chainId, this.address);
  }

  async getBalance(session: ClientSession, address: string, user: string): Promise<IUserBalance | null> {
    return await this.db.getBalance(this.chainId, address, user);
  }

  async getBalancesByProjectToken(
    session: ClientSession,
    ptAddress: string,
    user: string,
  ): Promise<Array<IUserBalance>> {
    return await this.db.getBalancesByProjectToken(this.chainId, ptAddress, user);
  }

  protected detectNegativeAmount(
    name: string,
    data: Record<string, string>,
    fieldsToCheck: string[],
    logData: Record<string, any> = {},
  ) {
    const faultyFields: Record<string, string> = {};
    fieldsToCheck.forEach((field) => {
      if (data[field] !== undefined && data[field].startsWith("-")) {
        faultyFields[field] = data[field];
      }
    });

    if (Object.keys(faultyFields).length > 0) {
      this.log.error({
        ...logData,
        msg: `Invalid update detected : negative amounts in ${name}`,
        faultyFields,
        chainId: this.chainId,
      });
      throw new Error(`Invalid update detected : negative amounts in ${name}`);
    }
  }

  protected checkBalanceUpdateAmounts(data: Partial<IUserBalance>, address: string, user: string) {
    const fieldsToCheck: Array<keyof IUserBalance> = [
      "balance",
      "balancePT",
      "fullyChargedBalance",
      "partiallyChargedBalance",
      "claimedRewardPerShare1e18",
      "valueProjectTokenToFullRecharge",
    ];

    this.detectNegativeAmount("user balance", data as Record<string, string>, fieldsToCheck, {
      address,
      user,
    });
  }

  protected checkUpdateAmounts(data: Partial<T> | T) {}

  async updateBalanceAndNotify(
    session: ClientSession,
    address: string,
    user: string,
    balanceUpdates: Partial<IUserBalance>,
    blockNumber: number,
    ptAddress?: string,
    eventName?: string,
  ): Promise<void> {
    this.checkBalanceUpdateAmounts(balanceUpdates, address, user);

    this.log.info({
      msg: "applying update to balance",
      address,
      user,
      balanceUpdates,
      eventName,
      contract: this.constructor.name,
      chainId: this.chainId,
    });

    await this.db.updateBalance({
      ...balanceUpdates,
      chainId: this.chainId,
      address,
      user,
      lastUpdateBlock: blockNumber,
    });

    if (balanceUpdates.balancePT !== undefined && ptAddress !== undefined) {
      this.log.info({
        msg: "propagating project token balance",
        ptAddress,
        user,
        eventName,
        contract: this.constructor.name,
        chainId: this.chainId,
      });

      await this.db.updateOtherBalancesByProjectToken(address, {
        chainId: this.chainId,
        user,
        ptAddress,
        balancePT: balanceUpdates.balancePT,
        lastUpdateBlock: blockNumber,
      });
    }

    if (ptAddress === undefined) {
      const newBalance = (await this.getBalance(session, address, user)) as HydratedDocument<IUserBalance>;

      this.log.trace({
        msg: "sending balance update :",
        data: newBalance,
        contract: this.constructor.name,
        address: this.address,
        chainId: this.chainId,
      });

      pubSub.publish(`UserBalance.${this.chainId}.${user}`, [newBalance]);
    } else {
      const updatedBalances = await this.getBalancesByProjectToken(session, ptAddress, user);

      try {
        this.log.trace({
          msg: "sending multiple balance updates :",
          data: updatedBalances,
          contract: this.constructor.name,
          ptAddress,
          chainId: this.chainId,
        });

        for (const b of updatedBalances) {
          pubSub.publish(`UserBalance.${this.chainId}.${user}`, [b]);
        }
      } catch (err) {
        this.log.error({
          msg: "Error loading updated balances after pt balance changed",
          err,
          chainId: this.chainId,
          ptAddress,
        });
      }
    }
  }

  /** Saves or updates the document in database with the given data. */
  async saveOrUpdate(session: ClientSession, data: Partial<T> | T, blockNumber: number): Promise<T> {
    this.checkUpdateAmounts(data);

    if (await this.exists()) {
      await this.db.update(this.dataType, {
        ...data,
        chainId: this.chainId,
        address: this.address,
        lastUpdateBlock: blockNumber,
      });
    } else {
      await this.db.save(this.dataType, data as T);
    }

    const result = await this.get(session);
    if (result === null) {
      throw new Error("Error connecting to database !");
    }
    this.lastState = result;

    return result;
  }

  async getJsonModel(session: ClientSession): Promise<T> {
    const result = await this.get(session);
    if (result === null) {
      throw new Error("Document not found !");
    }
    return result;
  }

  async applyUpdateAndNotify(
    session: ClientSession,
    data: Partial<T>,
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {
    this.log.info({
      msg: "applying update to contract",
      eventName,
      data,
      contract: this.constructor.name,
      address: this.address,
      chainId: this.chainId,
    });

    await this.saveOrUpdate(session, data, blockNumber);

    this.log.debug({
      msg: "sending update to channel",
      data: this.lastState,
      loader: this.constructor.name,
      chainId: this.chainId,
      address: this.address,
      contract: this.constructor.name,
    });

    pubSub.publish(`${this.dataType}.${this.chainId}.${this.address}`, this.lastState);
    pubSub.publish(`${this.dataType}.${this.chainId}`, this.lastState);
  }

  subscribeToEvents() {
    this.blockchain.subscribeToEvents(this.dataType, this.address, this);

    this.log.info({
      msg: "Subscribed to all events",
      contract: this.dataType,
      address: this.address,
      chainId: this.chainId,
    });
  }

  async onEvent(
    session: ClientSession,
    name: string,
    args: any[],
    blockNumber: number,
    log: ethers.providers.Log,
  ): Promise<void> {
    const eventHandlerName = `on${name}Event` as keyof this;

    try {
      this.log.info({
        msg: `Running event handler for ${name}`,
        args: args.map((arg) => (arg instanceof BigNumber ? arg.toString() : arg)),
        contract: this.constructor.name,
        address: this.address,
        chainId: this.chainId,
        blockNumber,
        txIndex: log.transactionIndex,
        logIndex: log.logIndex,
        txHash: log.transactionHash,
      });

      await (this[eventHandlerName] as IEventHandler).apply(this, [
        session,
        args,
        blockNumber,
        `${this.constructor.name}.${String(eventHandlerName)}`,
      ]);

      this.log.info({
        msg: `Event handler for ${name} executed`,
        args: args.map((arg) => (arg instanceof BigNumber ? arg.toString() : arg)),
        contract: this.constructor.name,
        address: this.address,
        chainId: this.chainId,
        blockNumber,
        txIndex: log.transactionIndex,
        logIndex: log.logIndex,
        txHash: log.transactionHash,
      });
    } catch (err) {
      const msg = `Error running Event handler for event ${eventHandlerName as string}`;
      this.log.error({
        msg,
        err,
        contract: this.constructor.name,
        address: this.address,
        chainId: this.chainId,
        blockNumber,
        txIndex: log.transactionIndex,
        logIndex: log.logIndex,
        txHash: log.transactionHash,
      });
      throw new Error(msg);
    }
  }

  async onOwnershipTransferredEvent(
    session: ClientSession,
    [owner]: any[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {
    // common handler for all ownable contracts
    // we do nothing since it happens only when a ChargedToken is added, which will be read in the same session
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    const data = { owner } as Partial<T>;
    await this.applyUpdateAndNotify(session, data, blockNumber);
  }
}
