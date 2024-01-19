import { type ClientSession } from "mongoose";
import { ChargedToken } from "./ChargedToken";

export class FundraisingChargedToken extends ChargedToken {
  async load(blockNumber: number) {
    this.log.debug({
      msg: "Reading entire fundraising charged token",
      chainId: this.chainId,
      contract: this.contract.name,
      address: this.address,
    });

    const ins = this.instance;

    const chargedTokenData = await super.load(blockNumber);

    return {
      ...chargedTokenData,
      // fundraising
      isFundraisingContract: true,
      fundraisingTokenSymbol: (await ins.fundraisingTokenSymbol()).toString(),
      priceTokenPer1e18: (await ins.priceTokenPer1e18()).toString(),
      fundraisingToken: (await ins.fundraisingToken()).toString(),
      isFundraisingActive: await ins.isFundraisingActive(),
    };
  }

  // Fundraising
  async onFundraisingConditionsSetEvent(
    session: ClientSession,
    [token, symbol, price1e18]: any[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {
    await this.applyUpdateAndNotify(
      session,
      {
        fundraisingToken: token,
        fundraisingTokenSymbol: symbol,
        priceTokenPer1e18: price1e18,
      },
      blockNumber,
      eventName,
    );
  }

  async onLTAllocatedThroughSaleEvent(
    session: ClientSession,
    [user, valueLT, valuePayment, fee]: any[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {}

  async onFundraisingStatusChangedEvent(
    session: ClientSession,
    []: any[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {
    await this.applyUpdateAndNotify(
      session,
      {
        isFundraisingActive: await this.instance.isFundraisingActive(),
      },
      blockNumber,
      eventName,
    );
  }
}
