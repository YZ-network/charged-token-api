import { BigNumber, ethers, EventFilter } from "ethers";
import mongoose, { FlattenMaps, HydratedDocument } from "mongoose";
import { Logger } from "pino";
import { pubSub } from "../graphql";
import { IUserBalance, UserBalanceModel } from "../models";
import { IContract, IEventHandler, IModel } from "../types";
import { rootLogger } from "../util";

interface ListenerRegistration {
  eventName: string;
  listener: ethers.providers.Listener;
}

/**
 * Generic contract loader. Used for loading initial contracts state, keeping
 * up with new block events and saving the result to database.
 *
 * When a document already exists, it will sync all events from the last checkpoint
 * to the latest block number before watching new blocks.
 */
export abstract class AbstractLoader<T extends IContract> {
  readonly chainId: number;
  protected readonly provider: ethers.providers.JsonRpcProvider;
  readonly address: string;
  protected readonly contract: any;
  protected readonly model: IModel<T>;
  protected readonly log: Logger<{
    name: string;
  }>;

  protected readonly instance: ethers.Contract;
  protected readonly iface: ethers.utils.Interface;
  initBlock: number = 0;
  lastUpdateBlock: number = 0;
  protected actualBlock: number = 0;
  protected lastState: FlattenMaps<T> | undefined;

  protected readonly registeredListeners: ListenerRegistration[] = [];

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
  async init(actualBlock?: number): Promise<void> {
    this.actualBlock =
      actualBlock !== undefined
        ? actualBlock
        : await this.provider.getBlockNumber();

    const existing = await this.get();

    if (existing != null) {
      this.initBlock = existing.initBlock;
      this.lastUpdateBlock = existing.lastUpdateBlock;
      this.lastState = this.model.toGraphQL(existing);
      await this.syncEvents(this.lastUpdateBlock + 1, this.actualBlock);
    } else {
      this.log.info("First time loading");
      const saved = await this.saveOrUpdate(await this.load());
      this.lastState = this.model.toGraphQL(saved);
      this.initBlock = this.actualBlock;
      this.lastUpdateBlock = this.actualBlock;

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
  async get(): Promise<HydratedDocument<T> | null> {
    return await this.model.findOne({
      chainId: this.chainId,
      address: this.address,
    });
  }

  async getBalance(
    address: string,
    user: string
  ): Promise<HydratedDocument<IUserBalance> | null> {
    return await UserBalanceModel.findOne({
      address,
      user,
    });
  }

  async updateBalanceAndNotify(
    address: string,
    user: string,
    balanceUpdates: Partial<IUserBalance>
  ): Promise<void> {
    await UserBalanceModel.updateOne({ address, user }, balanceUpdates);

    const newBalance = (await this.getBalance(
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
  async saveOrUpdate(data: Partial<T> | T): Promise<HydratedDocument<T>> {
    if (await this.exists()) {
      await this.model.updateOne(
        { chainId: this.chainId, address: this.address },
        data
      );
    } else {
      await this.toModel(data as T).save();
    }

    const result = await this.get();
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

  async syncEvents(
    fromBlock: number,
    toBlock: number,
    missedLogs?: ethers.providers.Log[]
  ): Promise<void> {
    let missedEvents: ethers.Event[] = [];

    if (missedLogs === undefined) {
      try {
        this.log.info("Loading missed events");

        const eventFilter: EventFilter = {
          address: this.address,
        };

        missedEvents = await this.instance.queryFilter(eventFilter, fromBlock);

        for (const event of missedEvents) {
          const name = event.event!;
          const args = this.filterArgs(event.args);

          if (name === undefined) {
            this.log.warn({
              msg: "found unnamed event :",
              event,
            });
          } else {
            this.log.debug("delegating event processing");
            await this.onEvent(name, args);
          }
        }
      } catch (err) {
        this.log.error({
          msg: `Error retrieving events from block ${fromBlock}`,
          err,
        });
      }
    } else {
      for (const log of missedLogs) {
        const decodedLog = this.iface.parseLog(log);
        await this.onEvent(decodedLog.name, [...decodedLog.args.values()]);
      }
    }

    this.actualBlock = toBlock;
    this.lastUpdateBlock = this.actualBlock;
    await this.updateLastBlock();

    if (missedEvents.length > 0) {
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

  protected async getJsonModel(): Promise<FlattenMaps<T>> {
    return (await this.get())!.toJSON();
  }

  protected async applyUpdateAndNotify(data: Partial<T>) {
    const saved = await this.saveOrUpdate(data);

    this.lastState = this.model.toGraphQL(saved);
    this.lastUpdateBlock = this.actualBlock;

    this.log.trace({ msg: "sending update to channel", data: this.lastState });

    pubSub.publish(
      `${this.constructor.name}.${this.chainId}.${this.address}`,
      this.lastState
    );
    pubSub.publish(`${this.constructor.name}.${this.chainId}`, this.lastState);
  }

  subscribeToEvents() {
    const eventHandlers = Object.getOwnPropertyNames(
      Object.getPrototypeOf(this)
    )
      .filter((prop) => prop.match(/^on.*Event$/) !== null)
      .map((prop) => {
        const match = prop.match(/^on(.*)Event$/)!;
        const eventName = match[1];
        return {
          eventName,
          listener: (log: ethers.providers.Log) => {
            if (log.blockNumber <= this.initBlock) {
              this.log.warn({
                msg: "Skipping event from init block",
                event: log,
              });
              return;
            }
            const decodedLog = this.iface.parseLog(log);
            const args = [...decodedLog.args.values()];
            this.log.info({
              msg: `Calling event handler ${eventName}`,
              args: args.map((arg) =>
                arg instanceof BigNumber ? arg.toString() : arg
              ),
            });
            this.onEvent(eventName, args);
          },
        };
      });

    eventHandlers.forEach(({ eventName, listener }) => {
      this.log.debug(`Subscribing to ${eventName}`);
      this.provider.on(this.instance.filters[eventName](), listener);
      this.registeredListeners.push({ eventName, listener });
    });
  }

  unsubscribeEvents() {
    this.registeredListeners.forEach(({ eventName, listener }) => {
      this.log.debug(`Unsubscribing from ${eventName}`);
      this.provider.off(eventName, listener);
    });
    this.registeredListeners.splice(0);
  }

  private async onEvent(name: string, args: any[]): Promise<void> {
    const eventHandlerName = `on${name}Event` as keyof this;
    const session = await mongoose.startSession();

    await session.withTransaction(async () => {
      await (this[eventHandlerName] as IEventHandler)(args);
      await session.endSession();
    });
  }

  private async updateLastBlock() {
    await this.model.updateOne(
      { chainId: this.chainId, address: this.address },
      { lastUpdateBlock: this.lastUpdateBlock }
    );
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
