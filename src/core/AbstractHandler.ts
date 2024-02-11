import { BigNumber } from "ethers";
import { type ClientSession } from "mongoose";
import { Logger } from "pino";
import { rootLogger } from "../rootLogger";
import { AbstractBlockchainRepository } from "./AbstractBlockchainRepository";

type IEventHandler = (session: ClientSession, args: any[], blockNumber: number, eventName: string) => Promise<void>;

/**
 * Generic contract loader. Used for loading initial contracts state, keeping
 * up with new block events and saving the result to database.
 *
 * When a document already exists, it will sync all events from the last checkpoint
 * to the latest block number before watching new blocks.
 */
export abstract class AbstractHandler<T extends IContract> {
  readonly chainId: number;
  readonly address: string;
  protected readonly dataType: DataType;
  readonly log: Logger<{
    name: string;
  }>;

  protected readonly blockchain: AbstractBlockchainRepository;
  protected readonly loaderFactory: (
    dataType: DataType,
    chainId: number,
    address: string,
    blockchain: AbstractBlockchainRepository,
  ) => AbstractHandler<any>;

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
    loaderFactory: (
      dataType: DataType,
      chainId: number,
      address: string,
      blockchain: AbstractBlockchainRepository,
    ) => AbstractHandler<any>,
  ) {
    this.chainId = chainId;
    this.blockchain = blockchain;
    this.address = address;
    this.dataType = dataType;
    this.loaderFactory = loaderFactory;

    this.log = rootLogger.child({
      chainId,
      address,
      contract: this.constructor.name,
    });
  }

  protected async getLastState(session?: ClientSession): Promise<T> {
    const lastState = await this.blockchain.getLastState<T>(this.dataType, this.address, session);
    if (lastState === null) throw new Error("Last state not found !");
    return lastState;
  }

  protected async applyUpdateAndNotify(
    data: Partial<T>,
    blockNumber: number,
    eventName?: string,
    session?: ClientSession,
  ): Promise<void> {
    await this.blockchain.applyUpdateAndNotify(this.dataType, this.address, data, blockNumber, eventName, session);
  }

  protected async updateBalanceAndNotify(
    user: string,
    data: Partial<IUserBalance>,
    blockNumber: number,
    eventName?: string,
    ptAddress?: string,
    session?: ClientSession,
  ): Promise<void> {
    await this.blockchain.updateBalanceAndNotify(this.address, user, data, blockNumber, ptAddress, eventName, session);
  }

  protected async getBalance(user: string, session?: ClientSession): Promise<IUserBalance | null> {
    return await this.blockchain.getUserBalance(this.address, user, session);
  }

  protected async getPTBalance(user: string, session?: ClientSession): Promise<string | null> {
    return await this.blockchain.getUserPTBalanceFromDb(this.address, user, session);
  }

  async onEvent(session: ClientSession, name: string, args: any[], blockNumber: number, log: Log): Promise<void> {
    const eventHandlerName = `on${name}Event` as string;

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

      await (this[eventHandlerName as keyof this] as IEventHandler).apply(this, [session, args, blockNumber, name]);

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
    const data = { owner } as unknown as Partial<T>;
    await this.applyUpdateAndNotify(data, blockNumber, eventName, session);
  }
}
