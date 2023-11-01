import { BigNumber, ethers, type EventFilter } from "ethers";
import { type ClientSession, type FlattenMaps, type HydratedDocument } from "mongoose";
import { type Logger } from "pino";
import { pubSub } from "../graphql";
import { EventModel, UserBalanceModel, type IUserBalance } from "../models";
import topicsMap from "../topics";
import { type IEventHandler, type IModel, type IOwnable } from "../types";
import { rootLogger } from "../util";
import { type EventListener } from "./EventListener";

/**
 * Generic contract loader. Used for loading initial contracts state, keeping
 * up with new block events and saving the result to database.
 *
 * When a document already exists, it will sync all events from the last checkpoint
 * to the latest block number before watching new blocks.
 */
export abstract class AbstractLoader<T extends IOwnable> {
  readonly chainId: number;
  readonly provider: ethers.providers.JsonRpcProvider;
  readonly address: string;
  protected readonly contract: any;
  readonly model: IModel<T>;
  readonly log: Logger<{
    name: string;
  }>;

  readonly instance: ethers.Contract;
  readonly iface: ethers.utils.Interface;
  initBlock: number = 0;
  lastUpdateBlock: number = 0;
  lastState: FlattenMaps<T> | undefined;

  readonly eventsListener: EventListener;

  /**
   * @param provider ether provider.
   * @param address contract address.
   * @param contract contract abi.
   * @param model mongoose model for this contract.
   */
  protected constructor(
    eventListener: EventListener,
    chainId: number,
    provider: ethers.providers.JsonRpcProvider,
    address: string,
    contract: any,
    model: IModel<T>,
  ) {
    this.eventsListener = eventListener;
    this.chainId = chainId;
    this.provider = provider;
    this.address = address;
    this.contract = contract;
    this.model = model;

    this.instance = new ethers.Contract(address, contract.abi, provider);
    this.iface = new ethers.utils.Interface(contract.abi);

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

      this.initBlock = existing.initBlock;
      this.lastUpdateBlock = existing.lastUpdateBlock;
      this.lastState = this.model.toGraphQL(existing);

      const eventsStartBlock = Math.max(
        this.lastUpdateBlock, // last update block should be included in case of partial events handling
        this.initBlock + 1, // init block must be skipped because it was a full loading
        blockNumber - 100, // otherwise, limit the number of past blocks to query
      );

      if (eventsStartBlock > this.lastUpdateBlock) {
        this.log.warn({
          msg: "Skipped blocks for events syncing",
          contract: this.constructor.name,
          address: this.address,
          chainId: this.chainId,
          lastUpdateBlock: this.lastUpdateBlock,
          eventsStartBlock,
        });
      }

      await this.loadAndSyncEvents(eventsStartBlock, session);
    } else {
      this.log.info({
        msg: "First time loading",
        contract: this.constructor.name,
        address: this.address,
        chainId: this.chainId,
      });
      await this.saveOrUpdate(session, await this.load(blockNumber), blockNumber);

      this.initBlock = blockNumber;

      pubSub.publish(`${this.constructor.name}.${this.chainId}.${this.address}`, this.lastState);
      pubSub.publish(`${this.constructor.name}.${this.chainId}`, this.lastState);
    }

    if (createTransaction === true) await session.commitTransaction();
  }

  /**
   * Contract state full loading from blockchain method.
   */
  abstract load(blockNumber: number): Promise<T>;

  /**
   * Conversion from load method result to a mongoose document.
   */
  abstract toModel(data: T): HydratedDocument<T>;

  /** Checks for contract state in the database. */
  async exists(): Promise<boolean> {
    return (
      (await this.model.exists({
        chainId: this.chainId,
        address: this.address,
      })) !== null
    );
  }

  /** Returns contract state from the database or null. */
  async get(session: ClientSession): Promise<HydratedDocument<T> | null> {
    return await this.model.findOne(
      {
        chainId: this.chainId,
        address: this.address,
      },
      undefined,
      { session },
    );
  }

  async getBalance(
    session: ClientSession,
    address: string,
    user: string,
  ): Promise<HydratedDocument<IUserBalance> | null> {
    return await UserBalanceModel.findOne(
      {
        address,
        user,
      },
      undefined,
      { session },
    );
  }

  async getBalancesByProjectToken(
    session: ClientSession,
    ptAddress: string,
    user: string,
  ): Promise<Array<HydratedDocument<IUserBalance>> | null> {
    return await UserBalanceModel.find(
      {
        ptAddress,
        user,
      },
      undefined,
      { session },
    );
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

    await UserBalanceModel.updateOne(
      { address, user },
      { ...balanceUpdates, lastUpdateBlock: blockNumber },
      {
        session,
      },
    );

    if (balanceUpdates.balancePT !== undefined && ptAddress !== undefined) {
      this.log.info({
        msg: "propagating project token balance",
        ptAddress,
        user,
        eventName,
        contract: this.constructor.name,
        chainId: this.chainId,
      });

      if (balanceUpdates.balancePT === "0") {
        this.log.warn({
          msg: "setting user PT balance to 0",
          chainId: this.chainId,
          user,
          ptAddress,
        });
      }

      await UserBalanceModel.updateMany(
        { user, ptAddress, address: { $ne: address } },
        { balancePT: balanceUpdates.balancePT, lastUpdateBlock: blockNumber },
        {
          session,
        },
      );
    }

    if (ptAddress === undefined) {
      const newBalance = (await this.getBalance(session, address, user)) as HydratedDocument<IUserBalance>;

      this.log.trace({
        msg: "sending balance update :",
        data: newBalance.toJSON(),
        contract: this.constructor.name,
        address: this.address,
        chainId: this.chainId,
      });

      pubSub.publish(`UserBalance.${this.chainId}.${user}`, JSON.stringify([UserBalanceModel.toGraphQL(newBalance)]));
    } else {
      const updatedBalances = (await this.getBalancesByProjectToken(session, ptAddress, user)) as Array<
        HydratedDocument<IUserBalance>
      >;

      try {
        this.log.trace({
          msg: "sending multiple balance updates :",
          data: updatedBalances.map((b) => b.toJSON()),
          contract: this.constructor.name,
          ptAddress,
          chainId: this.chainId,
        });

        for (const b of updatedBalances) {
          pubSub.publish(`UserBalance.${this.chainId}.${user}`, JSON.stringify([UserBalanceModel.toGraphQL(b)]));
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
  async saveOrUpdate(session: ClientSession, data: Partial<T> | T, blockNumber: number): Promise<HydratedDocument<T>> {
    this.checkUpdateAmounts(data);

    if (await this.exists()) {
      await this.model.updateOne(
        { chainId: this.chainId, address: this.address },
        { ...data, lastUpdateBlock: blockNumber },
        { session },
      );
    } else {
      await this.toModel(data as T).save({ session });
    }
    this.lastUpdateBlock = blockNumber;

    const result = await this.get(session);
    if (result === null) {
      throw new Error("Error connecting to database !");
    }
    this.lastState = this.model.toGraphQL(result);

    return result;
  }

  private async loadAndSyncEvents(fromBlock: number, session: ClientSession) {
    let missedEvents: ethers.Event[] = [];

    try {
      const eventFilter: EventFilter = {
        address: this.address,
      };

      this.log.info({
        msg: `Querying missed events from block ${fromBlock}`,
        contract: this.constructor.name,
        address: this.address,
        chainId: this.chainId,
      });
      missedEvents = await this.instance.queryFilter(eventFilter, fromBlock);
      if (missedEvents === null) {
        this.log.warn({
          msg: `Events querying returned null since block ${fromBlock}`,
          contract: this.constructor.name,
          address: this.address,
          chainId: this.chainId,
        });
        return;
      }
      if (missedEvents.length === 0) {
        this.log.info({
          msg: "No events missed",
          contract: this.constructor.name,
          address: this.address,
          chainId: this.chainId,
        });
        return;
      }

      this.log.info({
        msg: `Found ${missedEvents.length} potentially missed events`,
        contract: this.constructor.name,
        address: this.address,
        chainId: this.chainId,
      });

      const filteredEvents: ethers.Event[] = [];
      for (const event of missedEvents) {
        if (
          (await EventModel.exists({
            chainId: this.chainId,
            address: this.address,
            blockNumber: event.blockNumber,
            txIndex: event.transactionIndex,
            logIndex: event.logIndex,
          })) === null
        ) {
          filteredEvents.push(event);
        }
      }
      if (missedEvents.length > filteredEvents.length) {
        this.log.info({
          msg: `Skipped ${missedEvents.length - filteredEvents.length} events already played`,
          // skipped: missedEvents.filter((log) => !filteredEvents.includes(log)),
          contract: this.constructor.name,
          address: this.address,
          chainId: this.chainId,
        });
      }

      missedEvents = filteredEvents;

      if (missedEvents.length > 0) {
        this.log.info({
          msg: `Found ${missedEvents.length} really missed events`,
          // missedEvents,
          contract: this.constructor.name,
          address: this.address,
          chainId: this.chainId,
        });
      }
    } catch (err) {
      this.log.error({
        msg: `Error retrieving events from block ${fromBlock}`,
        err,
        contract: this.constructor.name,
        address: this.address,
        chainId: this.chainId,
      });
    }

    if (missedEvents.length === 0) return;

    for (const event of missedEvents) {
      const name = event.event!;
      const args = this.filterArgs(event.args);

      if (name === undefined) {
        this.log.warn({
          msg: "found unnamed event :",
          event,
          contract: this.constructor.name,
          address: this.address,
          chainId: this.chainId,
        });
      } else {
        this.log.info({
          msg: "delegating event processing",
          contract: this.constructor.name,
          address: this.address,
          chainId: this.chainId,
        });
        await this.onEvent(session, name, args, event.blockNumber);
      }
    }
  }

  async getJsonModel(session: ClientSession): Promise<FlattenMaps<T>> {
    return (await this.get(session))!.toJSON();
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

    pubSub.publish(`${this.constructor.name}.${this.chainId}.${this.address}`, this.lastState);
    pubSub.publish(`${this.constructor.name}.${this.chainId}`, this.lastState);
  }

  subscribeToEvents() {
    const eventFilter: EventFilter = {
      address: this.address,
    };

    this.instance.on(eventFilter, (log: ethers.providers.Log) => {
      if (log.blockNumber <= this.initBlock) {
        this.log.warn({
          msg: "Skipping event from init block",
          event: log,
          contract: this.constructor.name,
          address: this.address,
          chainId: this.chainId,
        });
        return;
      }

      const eventName = topicsMap[this.constructor.name][log.topics[0]];
      this.eventsListener
        .queueLog(eventName, log, this)
        .then(() => {
          this.log.info({
            msg: `queued event ${eventName}`,
            contract: this.constructor.name,
            address: this.address,
            chainId: this.chainId,
            blockNumber: log.blockNumber,
            txIndex: log.transactionIndex,
            txHash: log.transactionHash,
            logIndex: log.logIndex,
            args: [...this.iface.parseLog(log).args.values()],
          });
        })
        .catch((err) => {
          this.log.error({
            msg: `error queuing event ${eventName}`,
            err,
            log,
            contract: this.constructor.name,
            address: this.address,
            chainId: this.chainId,
          });
        });
    });

    this.log.info({
      msg: "Subscribed to all events",
      contract: this.constructor.name,
      address: this.address,
      chainId: this.chainId,
    });
  }

  async destroy() {
    this.instance.removeAllListeners();
  }

  async onEvent(session: ClientSession, name: string, args: any[], blockNumber: number): Promise<void> {
    const eventHandlerName = `on${name}Event` as keyof this;

    try {
      this.log.info({
        msg: `Running event handler for ${name}`,
        args: args.map((arg) => (arg instanceof BigNumber ? arg.toString() : arg)),
        contract: this.constructor.name,
        address: this.address,
        chainId: this.chainId,
        blockNumber,
      });
      await (this[eventHandlerName] as IEventHandler).apply(this, [
        session,
        args,
        blockNumber,
        `${this.constructor.name}.${String(eventHandlerName)}`,
      ]);
    } catch (err) {
      const msg = `Error running Event handler for event ${eventHandlerName as string}`;
      this.log.error({
        msg,
        err,
        contract: this.constructor.name,
        address: this.address,
        chainId: this.chainId,
        blockNumber,
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

  private filterArgs(inputArgs: Record<string, any> | undefined): any[] {
    if (inputArgs === undefined) return [];

    const len = Object.keys(inputArgs).length >> 1;
    const args: any[] = [];
    for (let i = 0; i < len; i++) {
      args.push(inputArgs[`${i}`]);
    }
    return args;
  }
}
