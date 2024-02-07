import pino from "pino";
import { rootLogger } from "../rootLogger";
import { AbstractBlockchainRepository } from "./AbstractBlockchainRepository";
import { ChargedToken } from "./ChargedToken";
import { DelegableToLT } from "./DelegableToLT";
import { Directory } from "./Directory";
import { InterfaceProjectToken } from "./InterfaceProjectToken";
import { DataType, EMPTY_ADDRESS, IChargedToken, IDirectory, IInterfaceProjectToken } from "./types";

export class ContractsWatcher {
  readonly chainId: number;
  private readonly blockchain: AbstractBlockchainRepository;
  private readonly log: pino.Logger;

  constructor(chainId: number, blockchain: AbstractBlockchainRepository) {
    this.chainId = chainId;
    this.blockchain = blockchain;

    this.log = rootLogger.child({
      chainId,
      name: "ContractsWatcher",
    });
  }

  async registerDirectory(address: string): Promise<void> {
    this.log.info({ msg: "Registering directory", address, chainId: this.chainId });

    const blockNumber = await this.blockchain.getBlockNumber();
    const loader = new Directory(this.chainId, this.blockchain, address);

    const lastState = await this.blockchain.registerContract<IDirectory>(
      DataType.Directory,
      address,
      blockNumber,
      loader,
    );

    if (lastState.directory.length > 0) {
      this.log.info({ msg: "Directory has charged tokens", address, chainId: this.chainId });

      for (const ctAddress of lastState.directory) {
        await this.registerChargedToken(ctAddress, blockNumber);
      }
    }
  }

  async unregisterDirectory(address: string): Promise<void> {
    const lastState = this.blockchain.getLastState<IDirectory>(address);

    await this.blockchain.unregisterContract(DataType.Directory, address);

    for (const ctAddress of lastState.directory) {
      await this.unregisterChargedToken(ctAddress);
    }
  }

  async registerChargedToken(address: string, blockNumber: number): Promise<void> {
    this.log.info({ msg: "Registering charged token", address, chainId: this.chainId });

    const loader = new ChargedToken(this.chainId, this.blockchain, address);

    const lastState = await this.blockchain.registerContract(DataType.ChargedToken, address, blockNumber, loader);

    if (lastState.interfaceProjectToken !== EMPTY_ADDRESS) {
      this.log.info({ msg: "Charged token has interface", address, chainId: this.chainId });

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
    this.log.info({ msg: "Registering interface", address, chainId: this.chainId });

    const loader = new InterfaceProjectToken(this.chainId, this.blockchain, address);

    const lastState = await this.blockchain.registerContract(
      DataType.InterfaceProjectToken,
      address,
      blockNumber,
      loader,
    );

    if (lastState.projectToken !== EMPTY_ADDRESS) {
      if (!this.blockchain.isContractRegistered(lastState.projectToken)) {
        this.log.info({ msg: "Interface has new project token", address, chainId: this.chainId });

        await this.registerDelegableToLT(lastState.projectToken, blockNumber);
      } else {
        this.log.info({ msg: "Skipping project token already registered", address, chainId: this.chainId });
      }
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
    this.log.info({ msg: "Registering project token", address, chainId: this.chainId });

    const loader = new DelegableToLT(this.chainId, this.blockchain, address);

    await this.blockchain.registerContract(DataType.DelegableToLT, address, blockNumber, loader);
  }

  unregisterDelegableToLT(address: string): void {
    if (!this.blockchain.isDelegableStillReferenced(address)) {
      this.blockchain.unregisterContract(DataType.DelegableToLT, address);
    }
  }
}
