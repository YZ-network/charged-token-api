import { BigNumber, EMPTY_ADDRESS, type ClientSession } from "../../vendor";
import { AbstractBlockchainRepository } from "../AbstractBlockchainRepository";
import { AbstractHandler } from "../AbstractHandler";

export class DelegableToLT extends AbstractHandler<IDelegableToLT> {
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
    super(chainId, blockchain, address, "DelegableToLT", loaderFactory);
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
      const oldBalance = await this.getPTBalance(from, session);

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
          session,
        );
      }
    }
    if (to !== EMPTY_ADDRESS) {
      // p2p transfers are not covered by other events
      const oldBalance = await this.getPTBalance(to, session);

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
          session,
        );
      }
    }
    if (from === EMPTY_ADDRESS) {
      // minting project tokens
      const jsonModel = await this.getLastState(session);
      const update = {
        totalSupply: BigNumber.from(jsonModel.totalSupply).add(BigNumber.from(value)).toString(),
      };
      await this.applyUpdateAndNotify(update, blockNumber, eventName, session);
    }
    if (to === EMPTY_ADDRESS) {
      // burning project tokens
      const jsonModel = await this.getLastState(session);
      const update = {
        totalSupply: BigNumber.from(jsonModel.totalSupply).sub(BigNumber.from(value)).toString(),
      };
      await this.applyUpdateAndNotify(update, blockNumber, eventName, session);
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
    const jsonModel = await this.getLastState(session);

    const update = {
      validatedInterfaceProjectToken: [...jsonModel.validatedInterfaceProjectToken, interfaceProjectToken],
    };

    await this.applyUpdateAndNotify(update, blockNumber, eventName, session);
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
      session,
    );
  }

  async onInterfaceProjectTokenRemovedEvent(
    session: ClientSession,
    [interfaceProjectToken]: any[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {
    const jsonModel = await this.getLastState(session);

    const update = {
      validatedInterfaceProjectToken: jsonModel.validatedInterfaceProjectToken.filter(
        (address) => address !== interfaceProjectToken,
      ),
    };

    await this.applyUpdateAndNotify(update, blockNumber, eventName, session);
  }
}
