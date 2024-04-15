import { BigNumber, ClientSession, EMPTY_ADDRESS } from "../../vendor";
import { AbstractBlockchainRepository } from "../AbstractBlockchainRepository";
import { AbstractHandler } from "../AbstractHandler";

export class ChargedToken extends AbstractHandler<IChargedToken> {
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
    super(chainId, blockchain, address, "ChargedToken", loaderFactory);
  }

  async onTransferEvent(
    session: ClientSession,
    [from, to, value]: any[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {
    if (BigNumber.from(value).isZero()) {
      // empty transfer
      this.log.warn("Skipping transfer event processing since value is zero");
      return;
    }

    if (from !== EMPTY_ADDRESS) {
      if (from === this.address) {
        // withdrawing staked charged tokens
        const jsonModel = await this.getLastState(session);
        const totalLocked = BigNumber.from(jsonModel.totalLocked).sub(BigNumber.from(value)).toString();
        await this.applyUpdateAndNotify({ totalLocked }, blockNumber, eventName, session);
      } else {
        // p2p transfer
        const balanceFrom = await this.getBalance(from, session);
        if (balanceFrom !== null) {
          const balance = BigNumber.from(balanceFrom.balance).sub(BigNumber.from(value)).toString();
          await this.updateBalanceAndNotify(
            from,
            {
              balance,
            },
            blockNumber,
            eventName,
            undefined,
            session,
          );
        } else {
          this.log.info("Skipping from balance update since it was not found in db");
        }
      }
    }
    if (to !== EMPTY_ADDRESS) {
      if (to === this.address) {
        // depositing charged tokens for staking
        const jsonModel = await this.getLastState(session);
        const totalLocked = BigNumber.from(jsonModel.totalLocked).add(BigNumber.from(value)).toString();
        await this.applyUpdateAndNotify({ totalLocked }, blockNumber, eventName, session);
      } else {
        // p2p transfer
        const balanceTo = await this.getBalance(to, session);

        if (balanceTo !== null) {
          const balance = BigNumber.from(balanceTo.balance).add(BigNumber.from(value)).toString();

          await this.updateBalanceAndNotify(
            to,
            {
              balance,
            },
            blockNumber,
            eventName,
            undefined,
            session,
          );
        } else {
          this.log.info("Skipping to balance update since it was not found in db");
        }
      }
    }
    if (from === EMPTY_ADDRESS) {
      // minting charged tokens
      const jsonModel = await this.getLastState(session);
      const update = {
        totalSupply: BigNumber.from(jsonModel.totalSupply).add(BigNumber.from(value)).toString(),
      };
      await this.applyUpdateAndNotify(update, blockNumber, eventName, session);
    }
    if (to === EMPTY_ADDRESS) {
      // burning charged tokens
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

  async onUserFunctionsAreDisabledEvent(
    session: ClientSession,
    [areUserFunctionsDisabled]: any[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {
    await this.applyUpdateAndNotify({ areUserFunctionsDisabled }, blockNumber, eventName, session);
  }

  async onInterfaceProjectTokenSetEvent(
    session: ClientSession,
    [interfaceProjectToken]: any[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {
    await this.blockchain.registerContract(
      "InterfaceProjectToken",
      interfaceProjectToken,
      blockNumber,
      this.loaderFactory("InterfaceProjectToken", this.chainId, interfaceProjectToken, this.blockchain),
      session,
    );

    const lastState = await this.blockchain.getLastState<IInterfaceProjectToken>(
      "InterfaceProjectToken",
      interfaceProjectToken,
      session,
    );

    if (lastState === null) {
      throw new Error("Interface not found !");
    }

    if (lastState.projectToken !== EMPTY_ADDRESS) {
      await this.blockchain.registerContract(
        "DelegableToLT",
        lastState.projectToken,
        blockNumber,
        this.loaderFactory("DelegableToLT", this.chainId, lastState.projectToken, this.blockchain),
        session,
      );
    }

    await this.blockchain.setProjectTokenAddressOnBalances(this.address, lastState.projectToken, blockNumber, session);

    await this.applyUpdateAndNotify({ interfaceProjectToken }, blockNumber, eventName, session);
  }

  async onInterfaceProjectTokenIsLockedEvent(
    session: ClientSession,
    _: never[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {
    await this.applyUpdateAndNotify(
      {
        isInterfaceProjectTokenLocked: true,
      },
      blockNumber,
      eventName,
      session,
    );
  }

  async onIncreasedFullyChargedBalanceEvent(
    session: ClientSession,
    [user, value]: any[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {
    const oldBalance = await this.getBalance(user, session);

    if (oldBalance !== null) {
      const fullyChargedBalance = BigNumber.from(oldBalance.fullyChargedBalance).add(BigNumber.from(value)).toString();

      await this.updateBalanceAndNotify(
        user,
        {
          fullyChargedBalance,
        },
        blockNumber,
        eventName,
        undefined,
        session,
      );
    }
  }

  async onLTAllocatedByOwnerEvent(
    session: ClientSession,
    [user, value, hodlRewards, isAllocationStaked]: any[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {
    // total supply updated by transfer events
  }

  async onIncreasedTotalTokenAllocatedEvent(
    session: ClientSession,
    [value]: any[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {
    const jsonModel = await this.getLastState(session);

    await this.applyUpdateAndNotify(
      {
        totalTokenAllocated: BigNumber.from(jsonModel.totalTokenAllocated).add(BigNumber.from(value)).toString(),
      },
      blockNumber,
      eventName,
      session,
    );
  }

  async onIncreasedStakedLTEvent(
    session: ClientSession,
    [value]: any[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {
    const jsonModel = await this.getLastState(session);

    await this.applyUpdateAndNotify(
      {
        stakedLT: BigNumber.from(jsonModel.stakedLT).add(BigNumber.from(value)).toString(),
      },
      blockNumber,
      eventName,
      session,
    );
  }

  async onAllocationsAreTerminatedEvent(
    session: ClientSession,
    _: any[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {
    await this.applyUpdateAndNotify(
      {
        areAllocationsTerminated: true,
      },
      blockNumber,
      eventName,
      session,
    );
  }

  async onDecreasedFullyChargedBalanceAndStakedLTEvent(
    session: ClientSession,
    [user, value]: any[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {
    const oldBalance = await this.getBalance(user, session);

    if (oldBalance !== null) {
      const fullyChargedBalance = BigNumber.from(oldBalance.fullyChargedBalance).sub(BigNumber.from(value)).toString();

      await this.updateBalanceAndNotify(
        user,
        {
          fullyChargedBalance,
        },
        blockNumber,
        eventName,
        undefined,
        session,
      );
    }

    const jsonModel = await this.getLastState(session);

    await this.applyUpdateAndNotify(
      {
        stakedLT: BigNumber.from(jsonModel.stakedLT).sub(BigNumber.from(value)).toString(),
      },
      blockNumber,
      eventName,
      session,
    );
  }

  async onLTReceivedEvent(
    session: ClientSession,
    [user, value, totalFees, feesToRewardHodlers, hodlRewards]: any[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {
    // nothing to do, balance have been updated by onTransferEvent handler
  }

  async onClaimedRewardPerShareUpdatedEvent(
    session: ClientSession,
    [user, value]: any[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {
    const oldBalance = await this.getBalance(user, session);

    if (oldBalance !== null) {
      await this.updateBalanceAndNotify(
        user,
        {
          claimedRewardPerShare1e18: value.toString(),
        },
        blockNumber,
        eventName,
        undefined,
        session,
      );
    }
  }

  async onCurrentRewardPerShareAndStakingCheckpointUpdatedEvent(
    session: ClientSession,
    [rewardPerShare1e18, blockTime]: any[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {
    await this.applyUpdateAndNotify(
      {
        currentRewardPerShare1e18: rewardPerShare1e18.toString(),
        stakingDateLastCheckpoint: blockTime.toString(),
      },
      blockNumber,
      eventName,
      session,
    );
  }

  async onIncreasedCurrentRewardPerShareEvent(
    session: ClientSession,
    [value]: any[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {
    const jsonModel = await this.getLastState(session);

    const update = {
      currentRewardPerShare1e18: BigNumber.from(jsonModel.currentRewardPerShare1e18)
        .add(BigNumber.from(value))
        .toString(),
    };

    await this.applyUpdateAndNotify(update, blockNumber, eventName, session);
  }

  async onLTDepositedEvent(
    session: ClientSession,
    [user, value, hodlRewards]: any[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {
    // user balances updated by IncreasedFullyChargedBalance
  }

  async onStakingCampaignCreatedEvent(
    session: ClientSession,
    [startDate, duration, rewards]: any[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {
    const jsonModel = await this.getLastState(session);

    const bnRewards = BigNumber.from(rewards);

    const update = {
      stakingStartDate: startDate.toString(),
      stakingDateLastCheckpoint: startDate.toString(),
      stakingDuration: duration.toString(),
      campaignStakingRewards: rewards.toString(),
      totalStakingRewards: BigNumber.from(jsonModel.totalStakingRewards).add(bnRewards).toString(),
      totalTokenAllocated: BigNumber.from(jsonModel.totalTokenAllocated).add(bnRewards).toString(),
      /*
      totalSupply: BigNumber.from(jsonModel.totalSupply)
        .add(bnRewards)
        .toString(),
        */
    };

    await this.applyUpdateAndNotify(update, blockNumber, eventName, session);
  }

  async onWithdrawalFeesUpdatedEvent(
    session: ClientSession,
    [value]: any[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {
    await this.applyUpdateAndNotify(
      {
        withdrawFeesPerThousandForLT: value.toString(),
      },
      blockNumber,
      eventName,
      session,
    );
  }

  async onRatioFeesToRewardHodlersUpdatedEvent(
    session: ClientSession,
    [value]: any[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {
    await this.applyUpdateAndNotify(
      {
        ratioFeesToRewardHodlersPerThousand: value.toString(),
      },
      blockNumber,
      eventName,
      session,
    );
  }

  async onDecreasedPartiallyChargedBalanceEvent(
    session: ClientSession,
    [user, value]: any[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {
    const oldBalance = await this.getBalance(user, session);

    if (oldBalance !== null) {
      const partiallyChargedBalance = BigNumber.from(oldBalance.partiallyChargedBalance)
        .sub(BigNumber.from(value))
        .toString();

      await this.updateBalanceAndNotify(
        user,
        {
          partiallyChargedBalance,
        },
        blockNumber,
        eventName,
        undefined,
        session,
      );
    }
  }

  async onUpdatedDateOfPartiallyChargedAndDecreasedStakedLTEvent(
    session: ClientSession,
    [blockTime, value]: any[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {
    // dateOfPartiallyCharged updated by TokensDischargedEvent
    const jsonModel = await this.getLastState(session);

    const update = {
      stakedLT: BigNumber.from(jsonModel.stakedLT).sub(BigNumber.from(value)).toString(),
    };

    await this.applyUpdateAndNotify(update, blockNumber, eventName, session);
  }

  async onTokensDischargedEvent(
    session: ClientSession,
    [user, partiallyChargedBalance]: any[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {
    const oldBalance = await this.getBalance(user, session);

    if (oldBalance !== null) {
      await this.updateBalanceAndNotify(
        user,
        {
          fullyChargedBalance: "0",
          partiallyChargedBalance: partiallyChargedBalance.toString(),
        },
        blockNumber,
        eventName,
        undefined,
        session,
      );
    }
  }

  // Fundraising
  async onFundraisingConditionsSet(
    session: ClientSession,
    [token, symbol, price1e18]: any[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {
    await this.applyUpdateAndNotify(
      {
        fundraisingTokenSymbol: symbol,
        priceTokenPer1e18: price1e18,
        fundraisingToken: token,
      },
      blockNumber,
      eventName,
      session,
    );
  }

  async onLTAllocatedThroughSale(
    session: ClientSession,
    [user, valueLT, valuePayment, fee]: any[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {}

  async onFundraisingStatusChanged(
    session: ClientSession,
    []: any[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {
    await this.applyUpdateAndNotify(
      {
        isFundraisingActive: await this.blockchain.getChargedTokenFundraisingStatus(this.address),
      },
      blockNumber,
      eventName,
      session,
    );
  }

  // fundraising events

  // Fundraising
  async onFundraisingConditionsSetEvent(
    session: ClientSession,
    [token, symbol, price1e18]: any[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {
    await this.applyUpdateAndNotify(
      {
        fundraisingToken: token,
        fundraisingTokenSymbol: symbol,
        priceTokenPer1e18: price1e18,
      },
      blockNumber,
      eventName,
      session,
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
      {
        isFundraisingActive: await this.blockchain.getChargedTokenFundraisingStatus(this.address),
      },
      blockNumber,
      eventName,
      session,
    );
  }
}
