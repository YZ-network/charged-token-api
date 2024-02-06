import { BigNumber } from "ethers";
import { type ClientSession } from "mongoose";
import { AbstractBlockchainRepository } from "./AbstractBlockchainRepository";
import { AbstractDbRepository } from "./AbstractDbRepository";
import { AbstractLoader } from "./AbstractLoader";
import { type ChargedToken } from "./ChargedToken";
import { type Directory } from "./Directory";
import { DataType, EMPTY_ADDRESS, IDelegableToLT } from "./types";

export class DelegableToLT extends AbstractLoader<IDelegableToLT> {
  readonly ct: ChargedToken;
  readonly directory: Directory;

  constructor(
    chainId: number,
    blockchain: AbstractBlockchainRepository,
    address: string,
    directory: Directory,
    ct: ChargedToken,
    dbRepository: AbstractDbRepository,
  ) {
    super(chainId, blockchain, address, dbRepository, DataType.DelegableToLT);

    this.directory = directory;
    this.ct = ct;
  }

  protected checkUpdateAmounts(data: Partial<ChargedToken> | ChargedToken) {
    super.checkUpdateAmounts(data);

    const fieldsToCheck: string[] = ["totalSupply"];

    this.detectNegativeAmount(this.constructor.name, data as Record<string, string>, fieldsToCheck);
  }

  async load(blockNumber: number) {
    this.log.debug({
      msg: "Reading entire project token",
      chainId: this.chainId,
      contract: this.dataType,
      address: this.address,
    });

    return await this.blockchain.loadDelegableToLT(this.address, blockNumber);
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
      const oldBalance = await this.getBalance(session, this.ct.address, from);

      if (oldBalance !== null) {
        const balancePT = BigNumber.from(oldBalance.balancePT).sub(BigNumber.from(value)).toString();

        await this.updateBalanceAndNotify(
          session,
          this.ct.address,
          from,
          {
            balancePT,
          },
          blockNumber,
          this.address,
          eventName,
        );
      }
    }
    if (to !== EMPTY_ADDRESS) {
      // p2p transfers are not covered by other events
      const oldBalance = await this.getBalance(session, this.ct.address, to);

      if (oldBalance !== null) {
        const balancePT = BigNumber.from(oldBalance.balancePT).add(BigNumber.from(value)).toString();

        await this.updateBalanceAndNotify(
          session,
          this.ct.address,
          to,
          {
            balancePT,
          },
          blockNumber,
          this.address,
          eventName,
        );
      }
    }
    if (from === EMPTY_ADDRESS) {
      // minting project tokens
      const jsonModel = await this.getJsonModel(session);
      const update = {
        totalSupply: BigNumber.from(jsonModel.totalSupply).add(BigNumber.from(value)).toString(),
      };
      await this.applyUpdateAndNotify(session, update, blockNumber, eventName);
    }
    if (to === EMPTY_ADDRESS) {
      // burning project tokens
      const jsonModel = await this.getJsonModel(session);
      const update = {
        totalSupply: BigNumber.from(jsonModel.totalSupply).sub(BigNumber.from(value)).toString(),
      };
      await this.applyUpdateAndNotify(session, update, blockNumber, eventName);
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
    const jsonModel = await this.getJsonModel(session);

    const update = {
      validatedInterfaceProjectToken: [...jsonModel.validatedInterfaceProjectToken, interfaceProjectToken],
    };

    await this.applyUpdateAndNotify(session, update, blockNumber, eventName);
  }

  async onListOfValidatedInterfaceProjectTokenIsFinalizedEvent(
    session: ClientSession,
    _: any[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {
    await this.applyUpdateAndNotify(
      session,
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
    const jsonModel = await this.getJsonModel(session);

    const update = {
      validatedInterfaceProjectToken: jsonModel.validatedInterfaceProjectToken.filter(
        (address) => address !== interfaceProjectToken,
      ),
    };

    await this.applyUpdateAndNotify(session, update, blockNumber, eventName);
  }
}
