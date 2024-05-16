import { BigNumber, type ClientSession } from "../../vendor";
import type { AbstractBlockchainRepository } from "../AbstractBlockchainRepository";
import { AbstractHandler } from "../AbstractHandler";

export class InterfaceProjectToken extends AbstractHandler<IInterfaceProjectToken> {
  constructor(
    chainId: number,
    blockchain: AbstractBlockchainRepository,
    address: string,
    loaderFactory: (
      dataType: DataType,
      chainId: number,
      address: string,
      blockchain: AbstractBlockchainRepository,
    ) => AbstractHandler<any>,
  ) {
    super(chainId, blockchain, address, "InterfaceProjectToken", loaderFactory);
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
    const lastState = await this.getLastState(session);
    const oldBalance = await this.blockchain.getUserBalance(lastState.liquidityToken, user, session);

    if (oldBalance !== null) {
      const valueProjectTokenToFullRecharge = BigNumber.from(oldBalance.valueProjectTokenToFullRecharge)
        .add(BigNumber.from(valueIncreased))
        .toString();

      const { dateOfPartiallyCharged } = await this.blockchain.getUserLiquiToken(lastState.liquidityToken, user);

      await this.blockchain.updateBalanceAndNotify(
        lastState.liquidityToken,
        user,
        {
          valueProjectTokenToFullRecharge,
          dateOfPartiallyCharged: dateOfPartiallyCharged.toString(),
        },
        blockNumber,
        undefined,
        eventName,
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
    const lastState = await this.getLastState(session);
    const oldBalance = await this.blockchain.getUserBalance(lastState.liquidityToken, user, session);

    if (oldBalance !== null) {
      const valueProjectTokenToFullRecharge = BigNumber.from(oldBalance.valueProjectTokenToFullRecharge)
        .sub(BigNumber.from(valueProjectToken))
        .toString();

      await this.blockchain.updateBalanceAndNotify(
        lastState.liquidityToken,
        user,
        {
          valueProjectTokenToFullRecharge,
        },
        blockNumber,
        undefined,
        eventName,
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
