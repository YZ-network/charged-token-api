import { BigNumber, ethers } from "ethers";
import { ClientSession } from "mongoose";
import { contracts } from "../contracts";
import { DelegableToLTModel, IDelegableToLT } from "../models/DelegableToLT";
import { EMPTY_ADDRESS } from "../types";
import { AbstractLoader } from "./AbstractLoader";
import { ChargedToken } from "./ChargedToken";
import { Directory } from "./Directory";

export class DelegableToLT extends AbstractLoader<IDelegableToLT> {
  readonly ct: ChargedToken;
  readonly directory: Directory;

  constructor(
    chainId: number,
    provider: ethers.providers.JsonRpcProvider,
    address: string,
    directory: Directory,
    ct: ChargedToken
  ) {
    super(
      chainId,
      provider,
      address,
      contracts.DelegableToLT,
      DelegableToLTModel
    );

    this.directory = directory;
    this.ct = ct;
  }

  toModel(data: IDelegableToLT) {
    return (DelegableToLTModel as any).toModel(data);
  }

  async load() {
    this.log.info("Reading entire project token");

    const ins = this.instance;

    const validatedInterfaceProjectToken: string[] = [];
    const validatedInterfaceCount = (
      await ins.countValidatedInterfaceProjectToken()
    ).toNumber();
    for (let i = 0; i < validatedInterfaceCount; i++) {
      validatedInterfaceProjectToken.push(
        await ins.getValidatedInterfaceProjectToken(i)
      );
    }

    return {
      // contract
      chainId: this.chainId,
      initBlock:
        this.lastState !== undefined
          ? this.lastState.initBlock
          : this.actualBlock,
      lastUpdateBlock: this.actualBlock,
      address: this.address,
      // ownable
      owner: await ins.owner(),
      // erc20
      name: await ins.name(),
      symbol: await ins.symbol(),
      decimals: (await ins.decimals()).toString(),
      balances: {},
      totalSupply: await ins.totalSupply(),
      // other
      validatedInterfaceProjectToken,
      isListOfInterfaceProjectTokenComplete:
        await ins.isListOfInterfaceProjectTokenComplete(),
    };
  }

  async loadUserBalance(user: string) {
    this.log.debug(`Loading PT balance for ${user}`);

    return (await this.instance.balanceOf(user)).toString();
  }

  async onTransferEvent(
    session: ClientSession,
    [from, to, value]: any[],
    eventName?: string
  ): Promise<void> {
    if ((value as BigNumber).isZero()) {
      this.log.warn("Skipping transfer event processing since value is zero");
      return;
    }

    if (from !== EMPTY_ADDRESS) {
      // p2p transfers are not covered by other events
      const oldBalance = await this.getBalance(session, this.ct.address, from);

      if (oldBalance !== null) {
        const balancePT = BigNumber.from(oldBalance.balancePT)
          .sub(BigNumber.from(value))
          .toString();

        await this.updateBalanceAndNotify(
          session,
          this.ct.address,
          from,
          {
            balancePT,
          },
          eventName
        );
      }
    }
    if (to !== EMPTY_ADDRESS) {
      // p2p transfers are not covered by other events
      const oldBalance = await this.getBalance(session, this.ct.address, to);

      if (oldBalance !== null) {
        const balancePT = BigNumber.from(oldBalance.balancePT)
          .add(BigNumber.from(value))
          .toString();

        await this.updateBalanceAndNotify(
          session,
          this.ct.address,
          to,
          {
            balancePT,
          },
          eventName
        );
      }
    }
    if (from === EMPTY_ADDRESS) {
      const jsonModel = await this.getJsonModel(session);
      const update = {
        totalSupply: BigNumber.from(jsonModel.totalSupply)
          .add(BigNumber.from(value))
          .toString(),
      };
      await this.applyUpdateAndNotify(session, update, eventName);
    }
    if (to === EMPTY_ADDRESS) {
      const jsonModel = await this.getJsonModel(session);
      const update = {
        totalSupply: BigNumber.from(jsonModel.totalSupply)
          .sub(BigNumber.from(value))
          .toString(),
      };
      await this.applyUpdateAndNotify(session, update, eventName);
    }
  }

  async onAddedAllTimeValidatedInterfaceProjectTokenEvent(
    session: ClientSession,
    [interfaceProjectToken]: any[],
    eventName?: string
  ): Promise<void> {}

  async onAddedInterfaceProjectTokenEvent(
    session: ClientSession,
    [interfaceProjectToken]: any[],
    eventName?: string
  ): Promise<void> {
    const jsonModel = await this.getJsonModel(session);

    const update = {
      validatedInterfaceProjectToken: [
        ...jsonModel.validatedInterfaceProjectToken,
        interfaceProjectToken,
      ],
    };

    await this.applyUpdateAndNotify(session, update, eventName);
  }

  async onListOfValidatedInterfaceProjectTokenIsFinalizedEvent(
    session: ClientSession,
    []: any[],
    eventName?: string
  ): Promise<void> {
    await this.applyUpdateAndNotify(
      session,
      {
        isListOfInterfaceProjectTokenComplete: true,
      },
      eventName
    );
  }

  async onInterfaceProjectTokenRemovedEvent(
    session: ClientSession,
    [interfaceProjectToken]: any[],
    eventName?: string
  ): Promise<void> {
    const jsonModel = await this.getJsonModel(session);

    const update = {
      validatedInterfaceProjectToken:
        jsonModel.validatedInterfaceProjectToken.filter(
          (address) => address !== interfaceProjectToken
        ),
    };

    await this.applyUpdateAndNotify(session, update, eventName);
  }
}
