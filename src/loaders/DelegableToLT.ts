import { BigNumber } from "ethers";
import { type ClientSession } from "mongoose";
import { AbstractBlockchainRepository } from "./AbstractBlockchainRepository";
import { AbstractLoader } from "./AbstractLoader";
import { DataType, EMPTY_ADDRESS, IDelegableToLT } from "./types";

export class DelegableToLT extends AbstractLoader<IDelegableToLT> {
  constructor(chainId: number, blockchain: AbstractBlockchainRepository, address: string) {
    super(chainId, blockchain, address, DataType.DelegableToLT);
  }

  async onTransferEvent(
    session: ClientSession,
    [from, to, value]: any[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {
    if (BigNumber.from(value).isZero()) {
      // empty transfers
      this.log.warn({
        msg: "Skipping transfer event processing since value is zero",
        chainId: this.chainId,
        contract: this.dataType,
        address: this.address,
      });
      return;
    }

    if (from !== EMPTY_ADDRESS) {
      // p2p transfers are not covered by other events
      const oldBalance = await this.getPTBalance(from);

      if (oldBalance !== null) {
        const balancePT = BigNumber.from(oldBalance).sub(BigNumber.from(value)).toString();

        await this.updateBalanceAndNotify(
          from,
          {
            balancePT,
          },
          blockNumber,
          eventName,
          this.address,
        );
      }
    }
    if (to !== EMPTY_ADDRESS) {
      // p2p transfers are not covered by other events
      const oldBalance = await this.getPTBalance(to);

      if (oldBalance !== null) {
        const balancePT = BigNumber.from(oldBalance).add(BigNumber.from(value)).toString();

        await this.updateBalanceAndNotify(
          to,
          {
            balancePT,
          },
          blockNumber,
          eventName,
          this.address,
        );
      }
    }
    if (from === EMPTY_ADDRESS) {
      // minting project tokens
      const jsonModel = await this.getLastState();
      const update = {
        totalSupply: BigNumber.from(jsonModel.totalSupply).add(BigNumber.from(value)).toString(),
      };
      await this.applyUpdateAndNotify(update, blockNumber, eventName);
    }
    if (to === EMPTY_ADDRESS) {
      // burning project tokens
      const jsonModel = await this.getLastState();
      const update = {
        totalSupply: BigNumber.from(jsonModel.totalSupply).sub(BigNumber.from(value)).toString(),
      };
      await this.applyUpdateAndNotify(update, blockNumber, eventName);
    }
  }

  async onApprovalEvent(
    session: ClientSession,
    [owner, spender, value]: any[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {
    // ignore it
  }

  async onAddedAllTimeValidatedInterfaceProjectTokenEvent(
    session: ClientSession,
    [interfaceProjectToken]: any[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {}

  async onAddedInterfaceProjectTokenEvent(
    session: ClientSession,
    [interfaceProjectToken]: any[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {
    const jsonModel = await this.getLastState();

    const update = {
      validatedInterfaceProjectToken: [...jsonModel.validatedInterfaceProjectToken, interfaceProjectToken],
    };

    await this.applyUpdateAndNotify(update, blockNumber, eventName);
  }

  async onListOfValidatedInterfaceProjectTokenIsFinalizedEvent(
    session: ClientSession,
    _: any[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {
    await this.applyUpdateAndNotify(
      {
        isListOfInterfaceProjectTokenComplete: true,
      },
      blockNumber,
      eventName,
    );
  }

  async onInterfaceProjectTokenRemovedEvent(
    session: ClientSession,
    [interfaceProjectToken]: any[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {
    const jsonModel = await this.getLastState();

    const update = {
      validatedInterfaceProjectToken: jsonModel.validatedInterfaceProjectToken.filter(
        (address) => address !== interfaceProjectToken,
      ),
    };

    await this.applyUpdateAndNotify(update, blockNumber, eventName);
  }
}
