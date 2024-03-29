import pino from "pino";
import { rootLogger } from "../rootLogger";
import { EMPTY_ADDRESS } from "../vendor";
import { AbstractBlockchainRepository } from "./AbstractBlockchainRepository";
import { handlerFactory } from "./handlers/factory";

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
    this.log.info({ chainId: this.chainId, address, msg: "Registering directory" });

    const blockNumber = await this.blockchain.getBlockNumber();
    const loader = handlerFactory("Directory", this.chainId, address, this.blockchain);

    const lastState = await this.blockchain.registerContract<IDirectory>("Directory", address, blockNumber, loader);

    if (lastState.directory.length > 0) {
      this.log.info({ chainId: this.chainId, address, msg: "Directory has charged tokens" });

      for (const ctAddress of lastState.directory) {
        await this.registerChargedToken(ctAddress, blockNumber);
      }
    }
  }

  async unregisterDirectory(address: string): Promise<void> {
    const lastState = await this.blockchain.getLastState<IDirectory>("Directory", address);

    if (lastState === null) {
      this.log.info({
        chainId: this.chainId,
        dataType: "Directory",
        address,
        msg: "Tried to unregister inexisting contract",
      });
      return;
    }

    await this.blockchain.unregisterContract("Directory", address);

    for (const ctAddress of lastState.directory) {
      await this.unregisterChargedToken(ctAddress);
    }
  }

  async registerChargedToken(address: string, blockNumber: number): Promise<void> {
    this.log.info({ chainId: this.chainId, address, msg: "Registering charged token" });

    const loader = handlerFactory("ChargedToken", this.chainId, address, this.blockchain);

    const lastState = await this.blockchain.registerContract("ChargedToken", address, blockNumber, loader);

    if (lastState.interfaceProjectToken !== EMPTY_ADDRESS) {
      await this.registerInterfaceProjectToken(lastState.interfaceProjectToken, blockNumber);
    }
  }

  async unregisterChargedToken(address: string): Promise<void> {
    const lastState = await this.blockchain.getLastState<IChargedToken>("ChargedToken", address);

    if (lastState === null) {
      this.log.info({
        chainId: this.chainId,
        dataType: "ChargedToken",
        address,
        msg: "Tried to unregister inexisting contract",
      });
      return;
    }

    await this.blockchain.unregisterContract("ChargedToken", address);

    if (lastState.interfaceProjectToken !== EMPTY_ADDRESS) {
      await this.unregisterInterfaceProjectToken(lastState.interfaceProjectToken);
    }
  }

  async registerInterfaceProjectToken(address: string, blockNumber: number): Promise<void> {
    this.log.info({ chainId: this.chainId, address, msg: "Registering interface" });

    const loader = handlerFactory("InterfaceProjectToken", this.chainId, address, this.blockchain);

    const lastState = await this.blockchain.registerContract("InterfaceProjectToken", address, blockNumber, loader);

    if (lastState.projectToken !== EMPTY_ADDRESS) {
      if (!this.blockchain.isContractRegistered(lastState.projectToken)) {
        this.log.info({ chainId: this.chainId, address, msg: "Interface has new project token" });

        await this.registerDelegableToLT(lastState.projectToken, blockNumber);
      } else {
        this.log.info({ chainId: this.chainId, address, msg: "Skipping project token already registered" });
      }
    }
  }

  async unregisterInterfaceProjectToken(address: string): Promise<void> {
    const lastState = await this.blockchain.getLastState<IInterfaceProjectToken>("InterfaceProjectToken", address);

    if (lastState === null) {
      this.log.info({
        chainId: this.chainId,
        dataType: "InterfaceProjectToken",
        address,
        msg: "Tried to unregister inexisting contract",
      });
      return;
    }

    await this.blockchain.unregisterContract("InterfaceProjectToken", address);

    if (lastState.projectToken !== EMPTY_ADDRESS) {
      await this.unregisterDelegableToLT(lastState.projectToken);
    }
  }

  async registerDelegableToLT(address: string, blockNumber: number): Promise<void> {
    this.log.info({ chainId: this.chainId, address, msg: "Registering project token" });

    const loader = handlerFactory("DelegableToLT", this.chainId, address, this.blockchain);

    await this.blockchain.registerContract("DelegableToLT", address, blockNumber, loader);
  }

  async unregisterDelegableToLT(address: string): Promise<void> {
    if (!(await this.blockchain.isDelegableStillReferenced(address))) {
      await this.blockchain.unregisterContract("DelegableToLT", address);
    }
  }
}
