import { BigNumber } from "ethers";
import { type ClientSession } from "mongoose";
import { AbstractBlockchainRepository } from "./AbstractBlockchainRepository";
import { AbstractDbRepository } from "./AbstractDbRepository";
import { AbstractLoader } from "./AbstractLoader";
import { type ChargedToken } from "./ChargedToken";
import { DelegableToLT } from "./DelegableToLT";
import { type Directory } from "./Directory";
import { DataType, IInterfaceProjectToken } from "./types";

export class InterfaceProjectToken extends AbstractLoader<IInterfaceProjectToken> {
  projectToken: DelegableToLT | undefined;
  skipProjectUpdates: boolean = true;

  readonly directory: Directory;
  readonly ct: ChargedToken;

  static readonly subscribedProjects: string[] = [];
  static readonly projectInstances: Record<string, DelegableToLT> = {};
  static readonly projectUsageCount: Record<string, number> = {};

  constructor(
    chainId: number,
    blockchain: AbstractBlockchainRepository,
    address: string,
    directory: Directory,
    ct: ChargedToken,
    dbRepository: AbstractDbRepository,
  ) {
    super(chainId, blockchain, address, dbRepository, DataType.InterfaceProjectToken);
    this.directory = directory;
    this.ct = ct;
  }

  async init(session: ClientSession, blockNumber: number, createTransaction?: boolean) {
    await super.init(session, blockNumber, createTransaction);

    if (!InterfaceProjectToken.subscribedProjects.includes(this.lastState!.projectToken)) {
      this.projectToken = new DelegableToLT(
        this.chainId,
        this.blockchain,
        this.lastState!.projectToken,
        this.directory,
        this.ct,
        this.db,
      );
      this.skipProjectUpdates = false;

      InterfaceProjectToken.projectInstances[this.projectToken.address] = this.projectToken;
      InterfaceProjectToken.subscribedProjects.push(this.projectToken.address);
      InterfaceProjectToken.projectUsageCount[this.projectToken.address] = 0;

      this.log.info({
        chainId: this.chainId,
        contract: "InterfaceProjectToken",
        address: this.address,
        skipProjectUpdates: this.skipProjectUpdates,
        msg: `Added Project Token ${this.lastState!.projectToken} to instances list`,
      });

      await this.projectToken.init(session, blockNumber, createTransaction);
    } else {
      this.projectToken = InterfaceProjectToken.projectInstances[this.lastState!.projectToken];
      InterfaceProjectToken.projectUsageCount[this.projectToken.address]++;

      this.log.info({
        chainId: this.chainId,
        contract: "InterfaceProjectToken",
        address: this.address,
        usageCount: InterfaceProjectToken.projectUsageCount[this.projectToken.address],
        msg: `Retrieved existing Project Token instance ${this.lastState!.projectToken}`,
      });
    }
  }

  async load(blockNumber: number) {
    this.log.debug({
      msg: "Reading entire interface project token",
      chainId: this.chainId,
      contract: this.dataType,
      address: this.address,
    });

    return await this.blockchain.loadInterfaceProjectToken(this.address, blockNumber);
  }

  async setProjectTokenAddressOnBalances(
    session: ClientSession,
    address: string,
    ptAddress: string,
    blockNumber: number,
  ): Promise<void> {
    this.log.info({
      msg: "will update PT address on balances for all users one by one",
      address,
      ptAddress,
      contract: this.constructor.name,
      chainId: this.chainId,
    });

    const balancesToUpdate = await this.db.getBalances(this.chainId, address);
    this.log.info({
      msg: "user balances to update !",
      count: balancesToUpdate.length,
      users: balancesToUpdate.map((balance) => balance.user),
    });

    const userPTBalances: Record<string, string> = {};

    for (const balance of balancesToUpdate) {
      if (userPTBalances[balance.user] === undefined) {
        userPTBalances[balance.user] = await this.blockchain.getUserBalancePT(balance.ptAddress, balance.user);
        this.log.info({
          msg: "loaded user PT balance",
          user: balance.user,
          balance: balance.balancePT,
        });
      }

      await this.updateBalanceAndNotify(
        session,
        address,
        balance.user,
        {
          ptAddress,
          balancePT: userPTBalances[balance.user],
        },
        blockNumber,
      );
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
        interface: this.address,
        skipProjectUpdates: this.skipProjectUpdates,
      });
    }
  }

  async destroy() {
    if (this.projectToken !== undefined) {
      if (InterfaceProjectToken.projectUsageCount[this.projectToken.address] === 0) {
        this.log.warn({
          msg: "Removing project token since this is the last reference",
          projectToken: this.projectToken.address,
          usageCount: InterfaceProjectToken.projectUsageCount[this.projectToken.address],
          chainId: this.chainId,
        });
        delete InterfaceProjectToken.projectInstances[this.projectToken.address];
        delete InterfaceProjectToken.projectUsageCount[this.projectToken.address];
        InterfaceProjectToken.subscribedProjects.splice(
          InterfaceProjectToken.subscribedProjects.indexOf(this.projectToken.address),
          1,
        );
      } else {
        this.log.info({
          msg: "Removing only interface, project token still in use",
          projectToken: this.projectToken.address,
          usageCount: InterfaceProjectToken.projectUsageCount[this.projectToken.address],
          chainId: this.chainId,
        });
        InterfaceProjectToken.projectUsageCount[this.projectToken.address]--;
      }
    }
  }

  async onStartSetEvent(
    session: ClientSession,
    [dateLaunch, dateEndCliff]: any[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {
    await this.applyUpdateAndNotify(
      session,
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
    const oldBalance = await this.getBalance(session, this.ct.address, user);

    if (oldBalance !== null) {
      const valueProjectTokenToFullRecharge = BigNumber.from(oldBalance.valueProjectTokenToFullRecharge)
        .add(BigNumber.from(valueIncreased))
        .toString();

      const { dateOfPartiallyCharged } = await this.blockchain.getUserLiquiToken(this.ct.address, user);

      await this.updateBalanceAndNotify(
        session,
        this.ct.address,
        user,
        {
          valueProjectTokenToFullRecharge,
          dateOfPartiallyCharged: dateOfPartiallyCharged.toString(),
        },
        blockNumber,
        undefined,
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
    const oldBalance = await this.getBalance(session, this.ct.address, user);

    if (oldBalance !== null) {
      const valueProjectTokenToFullRecharge = BigNumber.from(oldBalance.valueProjectTokenToFullRecharge)
        .sub(BigNumber.from(valueProjectToken))
        .toString();

      await this.updateBalanceAndNotify(
        session,
        this.ct.address,
        user,
        {
          valueProjectTokenToFullRecharge,
        },
        blockNumber,
        undefined,
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
      session,
      {
        claimFeesPerThousandForPT: valuePerThousand.toString(),
      },
      blockNumber,
      eventName,
    );
  }
}
