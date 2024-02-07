import { BigNumber, ethers } from "ethers";
import { type ClientSession } from "mongoose";
import { type Logger } from "pino";
import { rootLogger } from "../rootLogger";
import { IEventHandler } from "../types";
import { AbstractBlockchainRepository } from "./AbstractBlockchainRepository";
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
    dataType: DataType,
  ) {
    this.chainId = chainId;
    this.blockchain = blockchain;
    this.address = address;
    this.dataType = dataType;

    this.log = rootLogger.child({
      chainId,
      address,
      contract: this.constructor.name,
    });
  }

  protected getLastState(): T {
    return this.blockchain.getLastState<T>(this.address);
  }

  protected async applyUpdateAndNotify(data: Partial<T>, blockNumber: number, eventName?: string): Promise<void> {
    await this.blockchain.applyUpdateAndNotify(this.dataType, this.address, data, blockNumber, eventName);
  }

  protected async updateBalanceAndNotify(
    user: string,
    data: Partial<IUserBalance>,
    blockNumber: number,
    eventName?: string,
    ptAddress?: string,
  ): Promise<void> {
    await this.blockchain.updateBalanceAndNotify(this.address, user, data, blockNumber, ptAddress, eventName);
  }

  protected async getBalance(user: string): Promise<IUserBalance | null> {
    return await this.blockchain.getUserBalance(this.address, user);
  }

  protected async getPTBalance(user: string): Promise<string | null> {
    return await this.blockchain.getUserPTBalanceFromDb(this.address, user);
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
    await this.blockchain.applyUpdateAndNotify(this.dataType, this.address, data, blockNumber, eventName);
  }
}
