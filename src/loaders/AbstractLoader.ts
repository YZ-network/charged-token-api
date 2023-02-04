import { ethers, EventFilter } from "ethers";
import { FlattenMaps, HydratedDocument } from "mongoose";
import { pubSub } from "../graphql";
import { IContract, IEventHandler, IModel } from "../types";
import { Directory } from "./Directory";

export function subscribeToNewBlocks(
  provider: ethers.providers.JsonRpcProvider,
  directory: Directory
): void {
  provider.on("block", async (newBlockNumber) => {
    if (newBlockNumber > directory.lastUpdateBlock) {
      console.log(
        "new block :",
        directory.lastUpdateBlock,
        "=>",
        newBlockNumber
      );

      await directory.apply((loader) => loader.syncEvents(newBlockNumber));
    } else {
      console.log("skipping past block :", newBlockNumber);
    }
  });
}

export async function subscribeToUserBalancesLoading(
  directory: Directory
): Promise<void> {
  const sub = pubSub.subscribe("UserBalance/load");

  for await (const user of sub) {
    await directory.loadAllUserBalances(user);
  }
}

/**
 * Generic contract loader. Used for loading initial contracts state, keeping
 * up with new block events and saving the result to database.
 *
 * When a document already exists, it will sync all events from the last checkpoint
 * to the latest block number before watching new blocks.
 */
export abstract class AbstractLoader<T extends IContract> {
  protected readonly provider: ethers.providers.JsonRpcProvider;
  protected readonly address: string;
  protected readonly contract: any;
  protected readonly model: IModel<T>;

  protected readonly instance: ethers.Contract;
  lastUpdateBlock: number = 0;
  protected actualBlock: number = 0;
  protected lastState: FlattenMaps<T> | undefined;

  /**
   * @param provider ether provider.
   * @param address contract address.
   * @param contract contract abi.
   * @param model mongoose model for this contract.
   */
  protected constructor(
    provider: ethers.providers.JsonRpcProvider,
    address: string,
    contract: any,
    model: IModel<T>
  ) {
    this.provider = provider;
    this.address = address;
    this.contract = contract;
    this.model = model;

    this.instance = new ethers.Contract(address, contract.abi, provider);
  }

  async apply(fn: (loader: any) => Promise<void>): Promise<void> {
    await fn(this);
  }

  /**
   * Call this method after creating a new instance in order to fetch the initial
   * contract state from the blockchain or existing one from database.
   *
   * After initialization, the contract is up to date and the loader is subscribed to events.
   */
  async init(): Promise<void> {
    this.actualBlock = await this.provider.getBlockNumber();

    const existing = await this.get();

    if (existing != null) {
      this.lastUpdateBlock = existing.lastUpdateBlock;
      this.lastState = this.model.toGraphQL(existing);
      await this.syncEvents(this.lastUpdateBlock + 1);
    } else {
      console.log(
        "First time loading of",
        this.constructor.name,
        "@",
        this.address
      );
      const saved = await this.saveOrUpdate(await this.load());
      this.lastState = this.model.toGraphQL(saved);
      this.lastUpdateBlock = this.actualBlock;
      this.notifyUpdate();
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
    return (await this.model.exists({ address: this.address })) !== null;
  }

  /** Returns contract state from the database or null. */
  async get(): Promise<HydratedDocument<T> | null> {
    return await this.model.findOne({ address: this.address });
  }

  /** Saves or updates the document in database with the given data. */
  async saveOrUpdate(data: T): Promise<HydratedDocument<T>> {
    if (await this.exists()) {
      await this.model.updateOne({ address: this.address }, data);
    } else {
      await this.toModel(data).save();
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
    pubSub.publish(`${this.constructor.name}.${this.address}`, this.lastState);
  }

  async syncEvents(fromBlock: number): Promise<void> {
    console.log(
      "Syncing events for",
      this.constructor.name,
      "since",
      fromBlock
    );

    const eventFilter: EventFilter = {
      address: this.address,
    };
    const missedEvents = await this.instance.queryFilter(
      eventFilter,
      fromBlock
    );

    for (const event of missedEvents) {
      const name = event.event!;
      const args = this.filterArgs(event.args);

      await this.onEvent(name, args);
    }

    this.actualBlock = fromBlock;
    this.lastUpdateBlock = this.actualBlock;
    await this.updateLastBlock();

    if (missedEvents.length > 0) {
      this.notifyUpdate();
    }
  }

  private onEvent(name: string, args: any[]): Promise<void> {
    const eventHandlerName = `on${name}Event` as keyof this;
    console.log(
      "Calling event handler",
      this.constructor.name,
      eventHandlerName
    );
    return (this[eventHandlerName] as IEventHandler)(args);
  }

  private async updateLastBlock() {
    await this.model.updateOne(
      { address: this.address },
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
