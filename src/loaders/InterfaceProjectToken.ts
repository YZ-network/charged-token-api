import { BigNumber, ethers } from "ethers";
import { ClientSession } from "mongoose";
import { contracts } from "../contracts";
import {
  IInterfaceProjectToken,
  InterfaceProjectTokenModel,
} from "../models/InterfaceProjectToken";
import { AbstractLoader } from "./AbstractLoader";
import { ChargedToken } from "./ChargedToken";
import { DelegableToLT } from "./DelegableToLT";
import { Directory } from "./Directory";

export class InterfaceProjectToken extends AbstractLoader<IInterfaceProjectToken> {
  projectToken: DelegableToLT | undefined;
  readonly directory: Directory;
  readonly ct: ChargedToken;

  constructor(
    chainId: number,
    provider: ethers.providers.JsonRpcProvider,
    address: string,
    directory: Directory,
    ct: ChargedToken
  ) {
    super(
      ct.eventsListener,
      chainId,
      provider,
      address,
      contracts.InterfaceProjectToken,
      InterfaceProjectTokenModel
    );
    this.directory = directory;
    this.ct = ct;
  }

  async applyFunc(fn: (loader: any) => Promise<void>): Promise<void> {
    await super.applyFunc(fn);
    await this.projectToken?.applyFunc(fn);
  }

  async init(session: ClientSession, actualBlock?: number) {
    await super.init(session, actualBlock);

    this.projectToken = new DelegableToLT(
      this.chainId,
      this.provider,
      this.lastState!.projectToken,
      this.directory,
      this.ct
    );

    await this.projectToken.init(session, actualBlock);
  }

  toModel(data: IInterfaceProjectToken) {
    return (InterfaceProjectTokenModel as any).toModel(data);
  }

  async load() {
    this.log.info({
      msg: "Reading entire interface project token",
      chainId: this.chainId,
      contract: this.contract.name,
      address: this.address,
    });

    const ins = this.instance;

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
      // other
      liquidityToken: await ins.liquidityToken(),
      projectToken: await ins.projectToken(),
      dateLaunch: (await ins.dateLaunch()).toString(),
      dateEndCliff: (await ins.dateEndCliff()).toString(),
      claimFeesPerThousandForPT: (
        await ins.claimFeesPerThousandForPT()
      ).toString(),
    };
  }

  async loadUserBalancePT(user: string): Promise<string> {
    this.log.debug({
      msg: `Loading user PT balance from interface for ${user}`,
      chainId: this.chainId,
      contract: this.contract.name,
      address: this.address,
    });

    return this.projectToken === undefined
      ? "0"
      : await this.projectToken.loadUserBalance(user);
  }

  async loadValueProjectTokenToFullRecharge(user: string): Promise<string> {
    return (
      await this.instance.valueProjectTokenToFullRecharge(user)
    ).toString();
  }

  subscribeToEvents(): void {
    super.subscribeToEvents();
    this.projectToken!.subscribeToEvents();
  }

  async destroy() {
    if (this.projectToken !== undefined) await this.projectToken.destroy();
    await super.destroy();
  }

  async onStartSetEvent(
    session: ClientSession,
    [dateLaunch, dateEndCliff]: any[],
    eventName?: string
  ): Promise<void> {
    await this.applyUpdateAndNotify(
      session,
      {
        dateLaunch: dateLaunch.toString(),
        dateEndCliff: dateEndCliff.toString(),
      },
      eventName
    );
  }

  async onProjectTokenReceivedEvent(
    session: ClientSession,
    [user, value, fees, hodlRewards]: any[],
    eventName?: string
  ): Promise<void> {
    // user balances & totalSupply updated by TransferEvents
  }

  async onIncreasedValueProjectTokenToFullRechargeEvent(
    session: ClientSession,
    [user, valueIncreased]: any[],
    eventName?: string
  ): Promise<void> {
    const oldBalance = await this.getBalance(session, this.ct.address, user);

    if (oldBalance !== null) {
      const valueProjectTokenToFullRecharge = BigNumber.from(
        oldBalance.valueProjectTokenToFullRecharge
      )
        .add(BigNumber.from(valueIncreased))
        .toString();

      const { dateOfPartiallyCharged } = await this.ct.instance.userLiquiToken(
        user
      );

      await this.updateBalanceAndNotify(
        session,
        this.ct.address,
        user,
        {
          valueProjectTokenToFullRecharge,
          dateOfPartiallyCharged: dateOfPartiallyCharged.toString(),
        },
        eventName
      );
    }
  }

  async onLTRechargedEvent(
    session: ClientSession,
    [user, value, valueProjectToken, hodlRewards]: any[],
    eventName?: string
  ): Promise<void> {
    const oldBalance = await this.getBalance(session, this.ct.address, user);

    if (oldBalance !== null) {
      const valueProjectTokenToFullRecharge = BigNumber.from(
        oldBalance.valueProjectTokenToFullRecharge
      )
        .sub(BigNumber.from(valueProjectToken))
        .toString();

      await this.updateBalanceAndNotify(
        session,
        this.ct.address,
        user,
        {
          valueProjectTokenToFullRecharge,
        },
        eventName
      );
    }
  }

  async onClaimFeesUpdatedEvent(
    session: ClientSession,
    [valuePerThousand]: any[],
    eventName?: string
  ): Promise<void> {
    await this.applyUpdateAndNotify(
      session,
      {
        claimFeesPerThousandForPT: valuePerThousand.toString(),
      },
      eventName
    );
  }

  getProjectName(): string {
    return this.directory.lastState!.projectRelatedToLT[this.ct.address];
  }
}
