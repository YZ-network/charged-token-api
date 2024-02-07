import pino from "pino";
import { rootLogger } from "../rootLogger";
import { AbstractBlockchainRepository } from "./AbstractBlockchainRepository";
import { AbstractBroker } from "./AbstractBroker";
import { AbstractDbRepository } from "./AbstractDbRepository";
import { ChargedToken } from "./ChargedToken";
import { DelegableToLT } from "./DelegableToLT";
import { Directory } from "./Directory";
import { InterfaceProjectToken } from "./InterfaceProjectToken";
import { DataType, EMPTY_ADDRESS, IChargedToken, IDirectory, IInterfaceProjectToken } from "./types";

export class ContractsWatcher {
  readonly chainId: number;
  private readonly blockchain: AbstractBlockchainRepository;
  private readonly db: AbstractDbRepository;
  private readonly broker: AbstractBroker;
  private readonly log: pino.Logger;

  constructor(
    chainId: number,
    blockchain: AbstractBlockchainRepository,
    db: AbstractDbRepository,
    broker: AbstractBroker,
  ) {
    this.chainId = chainId;
    this.blockchain = blockchain;
    this.db = db;
    this.broker = broker;

    this.log = rootLogger.child({
      chainId,
      name: "ContractsWatcher",
    });
  }

  async registerDirectory(address: string): Promise<void> {
    const blockNumber = await this.blockchain.getBlockNumber();
    const loader = new Directory(this.chainId, this.blockchain, address);

    await this.blockchain.registerContract(DataType.Directory, address, blockNumber, loader);

    const lastState = this.blockchain.getLastState<IDirectory>(address);

    for (const ctAddress in lastState.directory) {
      await this.registerChargedToken(ctAddress, blockNumber);
    }
  }

  async unregisterDirectory(address: string): Promise<void> {
    const lastState = this.blockchain.getLastState<IDirectory>(address);

    await this.blockchain.unregisterContract(DataType.Directory, address);

    for (const ctAddress in lastState.directory) {
      await this.unregisterChargedToken(ctAddress);
    }
  }

  async registerChargedToken(address: string, blockNumber: number): Promise<void> {
    const loader = new ChargedToken(this.chainId, this.blockchain, address);

    await this.blockchain.registerContract(DataType.ChargedToken, address, blockNumber, loader);

    const lastState = this.blockchain.getLastState<IChargedToken>(address);

    if (lastState.interfaceProjectToken !== EMPTY_ADDRESS) {
      await this.registerInterfaceProjectToken(lastState.interfaceProjectToken, blockNumber);
    }
  }

  unregisterChargedToken(address: string): void {
    const lastState = this.blockchain.getLastState<IChargedToken>(address);

    this.blockchain.unregisterContract(DataType.ChargedToken, address);

    if (lastState.interfaceProjectToken !== EMPTY_ADDRESS) {
      this.unregisterInterfaceProjectToken(lastState.interfaceProjectToken);
    }
  }

  async registerInterfaceProjectToken(address: string, blockNumber: number): Promise<void> {
    const loader = new InterfaceProjectToken(this.chainId, this.blockchain, address);

    await this.blockchain.registerContract(DataType.InterfaceProjectToken, address, blockNumber, loader);

    const lastState = this.blockchain.getLastState<IInterfaceProjectToken>(address);

    if (lastState.projectToken !== EMPTY_ADDRESS && !this.blockchain.isContractRegistered(lastState.projectToken)) {
      await this.registerDelegableToLT(lastState.projectToken, blockNumber);
    }
  }

  unregisterInterfaceProjectToken(address: string): void {
    const lastState = this.blockchain.getLastState<IInterfaceProjectToken>(address);

    this.blockchain.unregisterContract(DataType.InterfaceProjectToken, address);

    if (lastState.projectToken !== EMPTY_ADDRESS) {
      this.unregisterDelegableToLT(lastState.projectToken);
    }
  }

  async registerDelegableToLT(address: string, blockNumber: number): Promise<void> {
    const loader = new DelegableToLT(this.chainId, this.blockchain, address);

    await this.blockchain.registerContract(DataType.DelegableToLT, address, blockNumber, loader);
  }

  unregisterDelegableToLT(address: string): void {
    if (!this.blockchain.isDelegableStillReferenced(address)) {
      this.blockchain.unregisterContract(DataType.DelegableToLT, address);
    }
  }
}
