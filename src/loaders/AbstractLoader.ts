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

  protected readonly instance: ethers.Contract;
  readonly iface: ethers.utils.Interface;
  initBlock: number = 0;
  lastUpdateBlock: number = 0;
  protected actualBlock: number = 0;
  protected lastState: FlattenMaps<T> | undefined;

  protected readonly eventsListener: EventListener;

  /**
   * @param provider ether provider.
   * @param address contract address.
   * @param contract contract abi.
   * @param model mongoose model for this contract.
   */
  protected constructor(
    chainId: number,
    provider: ethers.providers.JsonRpcProvider,
    address: string,
    contract: any,
    model: IModel<T>
  ) {
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
    this.eventsListener = new EventListener(this);
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
      await this.loadAndSyncEvents(this.lastUpdateBlock, session);
    } else {
      this.log.info("First time loading");
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
    balanceUpdates: Partial<IUserBalance>
  ): Promise<void> {
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
        data,
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
    this.log.trace({ msg: "sending contract update", data: this.lastState });

    pubSub.publish(
      `${this.constructor.name}.${this.chainId}.${this.address}`,
      this.lastState
    );
    pubSub.publish(`${this.constructor.name}.${this.chainId}`, this.lastState);
  }

  private async loadAndSyncEvents(fromBlock: number, session: ClientSession) {
    let missedEvents: ethers.Event[] = [];

    try {
      this.log.info("Loading missed events");

      const eventFilter: EventFilter = {
        address: this.address,
      };

      missedEvents = await this.instance.queryFilter(eventFilter, fromBlock);
      const sizeBeforeFilter = missedEvents.length;

      const filteredEvents: ethers.Event[] = [];
      for (const event of missedEvents) {
        if (
          (await EventModel.exists({
            chainId: this.chainId,
            address: this.address,
            blockNumber: event.blockNumber,
            txIndex: event.transactionIndex,
            logIndex: event.logIndex,
          })) !== null
        ) {
          filteredEvents.push(event);
        }
      }
      if (sizeBeforeFilter > missedEvents.length) {
        this.log.info({
          msg: `Skipped ${
            sizeBeforeFilter - missedEvents.length
          } events already played`,
          skipped: missedEvents.filter((log) => filteredEvents.includes(log)),
        });
      }

      missedEvents = filteredEvents;

      if (missedEvents.length > 0) {
        this.log.info(`Found ${missedEvents.length} missed events`);
      }
    } catch (err) {
      this.log.error({
        msg: `Error retrieving events from block ${fromBlock}`,
        err,
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
        });
      } else {
        this.log.info("delegating event processing");
        await this.onEvent(session, name, args);
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
    data: Partial<T>
  ) {
    await this.saveOrUpdate(session, data);

    this.log.debug({
      msg: "sending update to channel",
      data: this.lastState,
      loader: this.constructor.name,
      chainId: this.chainId,
      address: this.address,
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
        });
        return;
      }

      const eventName = Main.topicsMap[this.constructor.name][log.topics[0]];
      this.eventsListener
        .queueLog(eventName, log)
        .then(() => this.log.info(`queued event ${eventName}`))
        .catch((err) =>
          this.log.error({
            msg: `error queuing event ${eventName}`,
            err,
            log,
          })
        );
    });

    this.log.info(
      `Subscribed to all events on ${this.constructor.name}@${this.address}`
    );
  }

  async destroy() {
    this.provider.removeAllListeners();
    this.eventsListener.destroy();
  }

  async onEvent(
    session: ClientSession,
    name: string,
    args: any[]
  ): Promise<void> {
    const eventHandlerName = `on${name}Event` as keyof this;

    try {
      this.log.info({
        msg: `Running event handler for ${name} on ${this.constructor.name}@${this.address}`,
        args: args.map((arg) =>
          arg instanceof BigNumber ? arg.toString() : arg
        ),
      });
      await (this[eventHandlerName] as IEventHandler).apply(this, [
        session,
        args,
      ]);
    } catch (err) {
      const msg = `Error running Event handler for event ${
        eventHandlerName as string
      } on ${this.constructor.name} ${this.chainId} ${this.address}`;
      this.log.error({ msg, err });
      throw new Error(msg);
    }
  }

  async onOwnershipTransferredEvent(
    session: ClientSession,
    [owner]: any[]
  ): Promise<void> {
    // common handler for all ownable contracts
    await this.applyUpdateAndNotify(session, { owner } as Partial<T>);
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
