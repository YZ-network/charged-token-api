import { BigNumber } from "ethers";
import { type ClientSession } from "mongoose";
import { AbstractBlockchainRepository } from "./AbstractBlockchainRepository";
import { AbstractLoader } from "./AbstractLoader";
import { DataType, IInterfaceProjectToken } from "./types";

export class InterfaceProjectToken extends AbstractLoader<IInterfaceProjectToken> {
  constructor(chainId: number, blockchain: AbstractBlockchainRepository, address: string) {
    super(chainId, blockchain, address, DataType.InterfaceProjectToken);
  }

  async onStartSetEvent(
    session: ClientSession,
    [dateLaunch, dateEndCliff]: any[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {
    await this.applyUpdateAndNotify(
      {
        dateLaunch: dateLaunch.toString(),
        dateEndCliff: dateEndCliff.toString(),
      },
      blockNumber,
      eventName,
    );
  }

  async onProjectTokenReceivedEvent(
    session: ClientSession,
    [user, value, fees, hodlRewards]: any[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {
    // user balances & totalSupply updated by TransferEvents
  }

  async onIncreasedValueProjectTokenToFullRechargeEvent(
    session: ClientSession,
    [user, valueIncreased]: any[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {
    const oldBalance = await this.getBalance(user);
    const lastState = this.getLastState();

    if (oldBalance !== null) {
      const valueProjectTokenToFullRecharge = BigNumber.from(oldBalance.valueProjectTokenToFullRecharge)
        .add(BigNumber.from(valueIncreased))
        .toString();

      const { dateOfPartiallyCharged } = await this.blockchain.getUserLiquiToken(lastState.liquidityToken, user);

      await this.updateBalanceAndNotify(
        user,
        {
          valueProjectTokenToFullRecharge,
          dateOfPartiallyCharged: dateOfPartiallyCharged.toString(),
        },
        blockNumber,
        eventName,
      );
    }
  }

  async onLTRechargedEvent(
    session: ClientSession,
    [user, value, valueProjectToken, hodlRewards]: any[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {
    const oldBalance = await this.getBalance(user);

    if (oldBalance !== null) {
      const valueProjectTokenToFullRecharge = BigNumber.from(oldBalance.valueProjectTokenToFullRecharge)
        .sub(BigNumber.from(valueProjectToken))
        .toString();

      await this.updateBalanceAndNotify(
        user,
        {
          valueProjectTokenToFullRecharge,
        },
        blockNumber,
        eventName,
      );
    }
  }

  async onClaimFeesUpdatedEvent(
    session: ClientSession,
    [valuePerThousand]: any[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {
    await this.applyUpdateAndNotify(
      {
        claimFeesPerThousandForPT: valuePerThousand.toString(),
      },
      blockNumber,
      eventName,
    );
  }
}
