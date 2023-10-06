import { BigNumber, ethers } from "ethers";
import { ClientSession } from "mongoose";
import { contracts } from "../contracts";
import { UserBalanceModel } from "../models";
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
  static readonly subscribedProjects: string[] = [];
  static readonly projectInstances: Record<string, DelegableToLT> = {};
  static readonly projectUsageCount: Record<string, number> = {};
  skipProjectUpdates: boolean = true;
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
    if (this.skipProjectUpdates) {
      await this.projectToken?.applyFunc(fn);
    }
  }

  async init(session: ClientSession, actualBlock?: number) {
    await super.init(session, actualBlock);

    if (
      !InterfaceProjectToken.subscribedProjects.includes(
        this.lastState!.projectToken
      )
    ) {
      this.projectToken = new DelegableToLT(
        this.chainId,
        this.provider,
        this.lastState!.projectToken,
        this.directory,
        this.ct
      );
      this.skipProjectUpdates = false;

      InterfaceProjectToken.projectInstances[this.projectToken.address] =
        this.projectToken;
      InterfaceProjectToken.subscribedProjects.push(this.projectToken.address);
      InterfaceProjectToken.projectUsageCount[this.projectToken.address] = 0;

      await this.projectToken.init(session, actualBlock);
    } else {
      this.projectToken =
        InterfaceProjectToken.projectInstances[this.lastState!.projectToken];
      InterfaceProjectToken.projectUsageCount[this.projectToken.address]++;
    }
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

  async setProjectTokenAddressOnBalances(
    session: ClientSession,
    address: string,
    ptAddress: string
  ): Promise<void> {
    this.log.info({
      msg: "will update PT address on balances for all users one by one",
      address,
      ptAddress,
      contract: this.constructor.name,
      chainId: this.chainId,
    });

    const balancesToUpdate = await UserBalanceModel.find({ address }, null, {
      session,
    });
    this.log.info({
      msg: "user balances to update !",
      count: balancesToUpdate.length,
      users: balancesToUpdate.map((balance) => balance.user),
    });

    const userPTBalances: Record<string, string> = {};

    for (const balance of balancesToUpdate) {
      if (userPTBalances[balance.user] === undefined) {
        userPTBalances[balance.user] = await this.loadUserBalancePT(
          balance.user
        );
        this.log.info({
          msg: "loaded user PT balance",
          user: balance.user,
          balance: balance.balancePT,
        });
      }

      this.updateBalanceAndNotify(session, address, balance.user, {
        ptAddress,
        balancePT: userPTBalances[balance.user],
      });
    }
  }

  subscribeToEvents(): void {
    super.subscribeToEvents();
    if (!this.skipProjectUpdates) {
      this.projectToken!.subscribeToEvents();
    } else {
      this.log.info({
        msg: "Skipping contract event subscriptions to avoid duplicates",
        chainId: this.chainId,
        contract: "DelegableToLT",
        address: this.projectToken?.address,
      });
    }
  }

  async destroy() {
    if (this.projectToken !== undefined) {
      if (
        InterfaceProjectToken.projectUsageCount[this.projectToken.address] === 0
      ) {
        this.log.warn({
          msg: "Removing project token since this is the last reference",
          usageCount:
            InterfaceProjectToken.projectUsageCount[this.projectToken.address],
          chainId: this.chainId,
        });
        await this.projectToken.destroy();
      } else {
        this.log.info({
          msg: "Removing only interface, project token still in use",
          usageCount:
            InterfaceProjectToken.projectUsageCount[this.projectToken.address],
          chainId: this.chainId,
        });
        InterfaceProjectToken.projectUsageCount[this.projectToken.address]--;
      }
    }
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
        undefined,
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
        undefined,
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
}
