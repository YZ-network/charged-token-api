import { ethers, EventFilter } from "ethers";
import { FlattenMaps, HydratedDocument } from "mongoose";
import { IContract, IEventHandler, IModel } from "../types";

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
  protected lastUpdateBlock: number = 0;
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
      this.lastState = existing.toJSON();
      await this.syncEvents(this.lastUpdateBlock + 1);
    } else {
      this.lastState = (await this.saveOrUpdate(await this.load())).toJSON();
      this.lastUpdateBlock = this.actualBlock;
    }

    this.subscribeToNewBlocks();
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
    this.lastState = result.toJSON();
    return result;
  }

  private subscribeToNewBlocks(): void {
    this.provider.on("block", async (newBlockNumber) => {
      if (newBlockNumber > this.lastUpdateBlock) {
        this.actualBlock = newBlockNumber;
        await this.syncEvents(newBlockNumber);
      }
    });
  }

  private async syncEvents(fromBlock: number): Promise<void> {
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

    this.lastUpdateBlock = this.actualBlock;
    await this.updateLastBlock();
  }

  private onEvent(name: string, args: any[]): void {
    const eventHandlerName = `on${name}Event` as keyof this;
    (this[eventHandlerName] as IEventHandler)(args);
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
