import pino from "pino";
import { rootLogger } from "../rootLogger";
import { AbstractBlockchainRepository } from "./AbstractBlockchainRepository";
import { loaderFactory } from "./loaderFactory";
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
    const loader = loaderFactory(DataType.Directory, this.chainId, address, this.blockchain);

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
    const lastState = await this.blockchain.getLastState<IDirectory>(DataType.Directory, address);

    if (lastState === null) {
      this.log.info({
        msg: "Tried to unregister inexisting contract",
        dataType: DataType.Directory,
        address,
        chainId: this.chainId,
      });
      return;
    }

    await this.blockchain.unregisterContract(DataType.Directory, address);

    for (const ctAddress of lastState.directory) {
      await this.unregisterChargedToken(ctAddress);
    }
  }

  async registerChargedToken(address: string, blockNumber: number): Promise<void> {
    this.log.info({ msg: "Registering charged token", address, chainId: this.chainId });

    const loader = loaderFactory(DataType.ChargedToken, this.chainId, address, this.blockchain);

    const lastState = await this.blockchain.registerContract(DataType.ChargedToken, address, blockNumber, loader);

    if (lastState.interfaceProjectToken !== EMPTY_ADDRESS) {
      await this.registerInterfaceProjectToken(lastState.interfaceProjectToken, blockNumber);
    }
  }

  async unregisterChargedToken(address: string): Promise<void> {
    const lastState = await this.blockchain.getLastState<IChargedToken>(DataType.ChargedToken, address);

    if (lastState === null) {
      this.log.info({
        msg: "Tried to unregister inexisting contract",
        dataType: DataType.ChargedToken,
        address,
        chainId: this.chainId,
      });
      return;
    }

    await this.blockchain.unregisterContract(DataType.ChargedToken, address);

    if (lastState.interfaceProjectToken !== EMPTY_ADDRESS) {
      await this.unregisterInterfaceProjectToken(lastState.interfaceProjectToken);
    }
  }

  async registerInterfaceProjectToken(address: string, blockNumber: number): Promise<void> {
    this.log.info({ msg: "Registering interface", address, chainId: this.chainId });

    const loader = loaderFactory(DataType.InterfaceProjectToken, this.chainId, address, this.blockchain);

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

  async unregisterInterfaceProjectToken(address: string): Promise<void> {
    const lastState = await this.blockchain.getLastState<IInterfaceProjectToken>(
      DataType.InterfaceProjectToken,
      address,
    );

    if (lastState === null) {
      this.log.info({
        msg: "Tried to unregister inexisting contract",
        dataType: DataType.InterfaceProjectToken,
        address,
        chainId: this.chainId,
      });
      return;
    }

    await this.blockchain.unregisterContract(DataType.InterfaceProjectToken, address);

    if (lastState.projectToken !== EMPTY_ADDRESS) {
      await this.unregisterDelegableToLT(lastState.projectToken);
    }
  }

  async registerDelegableToLT(address: string, blockNumber: number): Promise<void> {
    this.log.info({ msg: "Registering project token", address, chainId: this.chainId });

    const loader = loaderFactory(DataType.DelegableToLT, this.chainId, address, this.blockchain);

    await this.blockchain.registerContract(DataType.DelegableToLT, address, blockNumber, loader);
  }

  async unregisterDelegableToLT(address: string): Promise<void> {
    if (!(await this.blockchain.isDelegableStillReferenced(address))) {
      await this.blockchain.unregisterContract(DataType.DelegableToLT, address);
    }
  }
}
