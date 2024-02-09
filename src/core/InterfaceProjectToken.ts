import { AbstractBlockchainRepository } from "./AbstractBlockchainRepository";
import { AbstractLoader } from "./AbstractLoader";
import { BigNumber, DataType, IInterfaceProjectToken, type ClientSession } from "./types";

export class InterfaceProjectToken extends AbstractLoader<IInterfaceProjectToken> {
  constructor(
    chainId: number,
    blockchain: AbstractBlockchainRepository,
    address: string,
    loaderFactory: (
      dataType: DataType,
      chainId: number,
      address: string,
      blockchain: AbstractBlockchainRepository,
    ) => AbstractLoader<any>,
  ) {
    super(chainId, blockchain, address, DataType.InterfaceProjectToken, loaderFactory);
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
      session,
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
    const oldBalance = await this.getBalance(user, session);
    const lastState = await this.getLastState(session);

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
        undefined,
        session,
      );
    }
  }

  async onLTRechargedEvent(
    session: ClientSession,
    [user, value, valueProjectToken, hodlRewards]: any[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {
    const oldBalance = await this.getBalance(user, session);

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
        undefined,
        session,
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
      session,
    );
  }
}
