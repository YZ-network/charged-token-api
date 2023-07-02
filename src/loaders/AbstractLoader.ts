import { BigNumber, ethers, EventFilter } from "ethers";
import { ClientSession, FlattenMaps, HydratedDocument } from "mongoose";
import { Logger } from "pino";
import { pubSub } from "../graphql";
import { Main } from "../main";
import { IUserBalance, UserBalanceModel } from "../models";
import { EventModel } from "../models/Event";
import { IEventHandler, IModel, IOwnable } from "../types";
import { rootLogger } from "../util";
import { EventListener } from "./EventListener";

/**
 * Generic contract loader. Used for loading initial contracts state, keeping
 * up with new block events and saving the result to database.
 *
 * When a document already exists, it will sync all events from the last checkpoint
 * to the latest block number before watching new blocks.
 */
export abstract class AbstractLoader<T extends IOwnable> {
  readonly chainId: number;
  protected readonly provider: ethers.providers.JsonRpcProvider;
  readonly address: string;
  protected readonly contract: any;
  protected readonly model: IModel<T>;
  readonly log: Logger<{
    name: string;
  }>;

  readonly instance: ethers.Contract;
  readonly iface: ethers.utils.Interface;
  initBlock: number = 0;
  lastUpdateBlock: number = 0;
  protected actualBlock: number = 0;
  protected lastState: FlattenMaps<T> | undefined;

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
    model: IModel<T>
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
      name: `(${chainId}) ${this.constructor.name}@${address}`,
    });
  }

  async applyFunc(fn: (loader: any) => Promise<void>): Promise<void> {
    await fn(this);
  }

  /**
   * Call this method after creating a new instance in order to fetch the initial
   * contract state from the blockchain or existing one from database.
   *
   * After initialization, the contract is up to date and the loader is subscribed to events.
   */
  async init(session: ClientSession, actualBlock?: number): Promise<void> {
    this.actualBlock =
      actualBlock !== undefined
        ? actualBlock
        : await this.provider.getBlockNumber();

    const existing = await this.get(session);

    if (existing != null) {
      this.initBlock = existing.initBlock;
      this.lastUpdateBlock = existing.lastUpdateBlock;
      this.lastState = this.model.toGraphQL(existing);

      const eventsStartBlock =
        actualBlock !== undefined && actualBlock > 0
          ? Math.max(actualBlock - 100, this.lastUpdateBlock + 1)
          : this.lastUpdateBlock + 1;

      await this.loadAndSyncEvents(eventsStartBlock, session);
    } else {
      this.log.info({
        msg: "First time loading",
        contract: this.constructor.name,
        address: this.address,
        chainId: this.chainId,
      });
      await this.saveOrUpdate(session, await this.load());
      this.initBlock = this.actualBlock;

      pubSub.publish(
        `${this.constructor.name}.${this.chainId}.${this.address}`,
        this.lastState
      );
      pubSub.publish(
        `${this.constructor.name}.${this.chainId}`,
        this.lastState
      );
    }
  }

  /**
   * Contract state full loading from blockchain method.
   */
  abstract load(): Promise<T>;

  /**
   * Conversion from load method result to a mongoose document.
   */
  toModel(data: T): HydratedDocument<T> {
    return this.model.toModel(data);
  }

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
      { session }
    );
  }

  async getBalance(
    session: ClientSession,
    address: string,
    user: string
  ): Promise<HydratedDocument<IUserBalance> | null> {
    return await UserBalanceModel.findOne(
      {
        address,
        user,
      },
      undefined,
      { session }
    );
  }

  async updateBalanceAndNotify(
    session: ClientSession,
    address: string,
    user: string,
    balanceUpdates: Partial<IUserBalance>,
    eventName?: string
  ): Promise<void> {
    this.log.info({
      msg: "applying update to balance",
      address,
      user,
      balanceUpdates,
      eventName,
      contract: this.constructor.name,
      chainId: this.chainId,
    });

    await UserBalanceModel.updateOne({ address, user }, balanceUpdates, {
      session,
    });

    const newBalance = (await this.getBalance(
      session,
      address,
      user
    )) as HydratedDocument<IUserBalance>;

    this.log.trace({
      msg: "sending balance update :",
      data: newBalance.toJSON(),
      contract: this.constructor.name,
      address: this.address,
      chainId: this.chainId,
    });

    pubSub.publish(
      `UserBalance.${this.chainId}.${user}`,
      JSON.stringify([UserBalanceModel.toGraphQL(newBalance)])
    );
  }

  /** Saves or updates the document in database with the given data. */
  async saveOrUpdate(
    session: ClientSession,
    data: Partial<T> | T
  ): Promise<HydratedDocument<T>> {
    if (await this.exists()) {
      await this.model.updateOne(
        { chainId: this.chainId, address: this.address },
        { ...data, lastUpdateBlock: this.actualBlock },
        { session }
      );
    } else {
      await this.toModel(data as T).save({ session });
    }

    const result = await this.get(session);
    if (result === null) {
      throw new Error("Error connecting to database !");
    }

    this.lastUpdateBlock = this.actualBlock;
    this.lastState = this.model.toGraphQL(result);

    return result;
  }

  notifyUpdate(): void {
    this.log.trace({
      msg: "sending contract update",
      data: this.lastState,
      contract: this.constructor.name,
      address: this.address,
      chainId: this.chainId,
    });

    pubSub.publish(
      `${this.constructor.name}.${this.chainId}.${this.address}`,
      this.lastState
    );
    pubSub.publish(`${this.constructor.name}.${this.chainId}`, this.lastState);
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
          msg: `Skipped ${
            missedEvents.length - filteredEvents.length
          } events already played`,
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

  protected async getJsonModel(
    session: ClientSession
  ): Promise<FlattenMaps<T>> {
    return (await this.get(session))!.toJSON();
  }

  protected async applyUpdateAndNotify(
    session: ClientSession,
    data: Partial<T>,
    eventName?: string
  ) {
    this.log.info({
      msg: "applying update to contract",
      eventName,
      data,
      contract: this.constructor.name,
      address: this.address,
      chainId: this.chainId,
    });

    await this.saveOrUpdate(session, data);

    this.log.debug({
      msg: "sending update to channel",
      data: this.lastState,
      loader: this.constructor.name,
      chainId: this.chainId,
      address: this.address,
      contract: this.constructor.name,
    });

    pubSub.publish(
      `${this.constructor.name}.${this.chainId}.${this.address}`,
      this.lastState
    );
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

      const eventName = Main.topicsMap[this.constructor.name][log.topics[0]];
      this.eventsListener
        .queueLog(eventName, log, this)
        .then(() => this.log.info(`queued event ${eventName}`))
        .catch((err) =>
          this.log.error({
            msg: `error queuing event ${eventName}`,
            err,
            log,
            contract: this.constructor.name,
            address: this.address,
            chainId: this.chainId,
          })
        );
    });

    this.log.info({
      msg: `Subscribed to all events`,
      contract: this.constructor.name,
      address: this.address,
      chainId: this.chainId,
    });
  }

  async destroy() {
    this.instance.removeAllListeners();
  }

  async onEvent(
    session: ClientSession,
    name: string,
    args: any[],
    blockNumber: number
  ): Promise<void> {
    if (this.actualBlock < blockNumber) this.actualBlock = blockNumber;

    const eventHandlerName = `on${name}Event` as keyof this;

    try {
      this.log.info({
        msg: `Running event handler for ${name}`,
        args: args.map((arg) =>
          arg instanceof BigNumber ? arg.toString() : arg
        ),
        contract: this.constructor.name,
        address: this.address,
        chainId: this.chainId,
        blockNumber,
      });
      await (this[eventHandlerName] as IEventHandler).apply(this, [
        session,
        args,
        `${this.constructor.name}.${String(eventHandlerName)}`,
      ]);
    } catch (err) {
      const msg = `Error running Event handler for event ${
        eventHandlerName as string
      }`;
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
    eventName?: string
  ): Promise<void> {
    // common handler for all ownable contracts
    // we do nothing since it happens only when a ChargedToken is added, which will be read in the same session
    // await this.applyUpdateAndNotify(session, { owner } as Partial<T>);
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
