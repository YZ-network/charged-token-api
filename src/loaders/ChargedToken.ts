import { BigNumber } from "ethers";
import { type ClientSession } from "mongoose";
import { AbstractBlockchainRepository } from "./AbstractBlockchainRepository";
import { AbstractLoader } from "./AbstractLoader";
import { InterfaceProjectToken } from "./InterfaceProjectToken";
import { DataType, EMPTY_ADDRESS, IChargedToken, IInterfaceProjectToken } from "./types";

export class ChargedToken extends AbstractLoader<IChargedToken> {
  constructor(chainId: number, blockchain: AbstractBlockchainRepository, address: string) {
    super(chainId, blockchain, address, DataType.ChargedToken);
  }

  async onTransferEvent(
    session: ClientSession,
    [from, to, value]: any[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {
    if (BigNumber.from(value).isZero()) {
      // empty transfer
      this.log.warn({
        msg: "Skipping transfer event processing since value is zero",
        chainId: this.chainId,
        contract: this.dataType,
        address: this.address,
      });
      return;
    }

    if (from !== EMPTY_ADDRESS) {
      if (from === this.address) {
        // withdrawing staked charged tokens
        const jsonModel = this.getLastState();
        const totalLocked = BigNumber.from(jsonModel!.totalLocked).sub(BigNumber.from(value)).toString();
        await this.applyUpdateAndNotify({ totalLocked }, blockNumber, eventName);
      } else {
        // p2p transfer
        const balanceFrom = await this.getBalance(from);
        if (balanceFrom !== null) {
          const balance = BigNumber.from(balanceFrom.balance).sub(BigNumber.from(value)).toString();
          await this.updateBalanceAndNotify(
            from,
            {
              balance,
            },
            blockNumber,
            eventName,
          );
        } else {
          this.log.info({
            msg: "Skipping from balance update since it was not found in db",
            chainId: this.chainId,
            contract: this.dataType,
            address: this.address,
          });
        }
      }
    }
    if (to !== EMPTY_ADDRESS) {
      if (to === this.address) {
        // depositing charged tokens for staking
        const jsonModel = this.getLastState();
        const totalLocked = BigNumber.from(jsonModel!.totalLocked).add(BigNumber.from(value)).toString();
        await this.applyUpdateAndNotify({ totalLocked }, blockNumber, eventName);
      } else {
        // p2p transfer
        const balanceTo = await this.getBalance(to);

        if (balanceTo !== null) {
          const balance = BigNumber.from(balanceTo.balance).add(BigNumber.from(value)).toString();

          await this.updateBalanceAndNotify(
            to,
            {
              balance,
            },
            blockNumber,
            eventName,
          );
        } else {
          this.log.info({
            msg: "Skipping to balance update since it was not found in db",
            chainId: this.chainId,
            contract: this.dataType,
            address: this.address,
          });
        }
      }
    }
    if (from === EMPTY_ADDRESS) {
      // minting charged tokens
      const jsonModel = this.getLastState();
      const update = {
        totalSupply: BigNumber.from(jsonModel.totalSupply).add(BigNumber.from(value)).toString(),
      };
      await this.applyUpdateAndNotify(update, blockNumber, eventName);
    }
    if (to === EMPTY_ADDRESS) {
      // burning charged tokens
      const jsonModel = this.getLastState();
      const update = {
        totalSupply: BigNumber.from(jsonModel.totalSupply).sub(BigNumber.from(value)).toString(),
      };
      await this.applyUpdateAndNotify(update, blockNumber, eventName);
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
    await this.blockchain.applyUpdateAndNotify(
      DataType.ChargedToken,
      this.address,
      { areUserFunctionsDisabled },
      blockNumber,
      eventName,
    );
  }

  async onInterfaceProjectTokenSetEvent(
    session: ClientSession,
    [interfaceProjectToken]: any[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {
    await this.blockchain.registerContract(
      DataType.InterfaceProjectToken,
      interfaceProjectToken,
      blockNumber,
      new InterfaceProjectToken(this.chainId, this.blockchain, interfaceProjectToken),
    );

    const lastState = this.blockchain.getLastState<IInterfaceProjectToken>(interfaceProjectToken);

    await this.blockchain.setProjectTokenAddressOnBalances(this.address, lastState.projectToken, blockNumber);

    await this.applyUpdateAndNotify({ interfaceProjectToken }, blockNumber, eventName);
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
    );
  }

  async onIncreasedFullyChargedBalanceEvent(
    session: ClientSession,
    [user, value]: any[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {
    const oldBalance = await this.getBalance(user);

    if (oldBalance !== null) {
      const fullyChargedBalance = BigNumber.from(oldBalance.fullyChargedBalance).add(BigNumber.from(value)).toString();

      await this.updateBalanceAndNotify(
        user,
        {
          fullyChargedBalance,
        },
        blockNumber,
        eventName,
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
    const jsonModel = this.getLastState();

    await this.applyUpdateAndNotify(
      {
        totalTokenAllocated: BigNumber.from(jsonModel.totalTokenAllocated).add(BigNumber.from(value)).toString(),
      },
      blockNumber,
      eventName,
    );
  }

  async onIncreasedStakedLTEvent(
    session: ClientSession,
    [value]: any[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {
    const jsonModel = this.getLastState();

    await this.applyUpdateAndNotify(
      {
        stakedLT: BigNumber.from(jsonModel.stakedLT).add(BigNumber.from(value)).toString(),
      },
      blockNumber,
      eventName,
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
    );
  }

  async onDecreasedFullyChargedBalanceAndStakedLTEvent(
    session: ClientSession,
    [user, value]: any[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {
    const oldBalance = await this.getBalance(user);

    if (oldBalance !== null) {
      const fullyChargedBalance = BigNumber.from(oldBalance.fullyChargedBalance).sub(BigNumber.from(value)).toString();

      await this.updateBalanceAndNotify(
        user,
        {
          fullyChargedBalance,
        },
        blockNumber,
        eventName,
      );
    }

    const jsonModel = this.getLastState();

    await this.applyUpdateAndNotify(
      {
        stakedLT: BigNumber.from(jsonModel.stakedLT).sub(BigNumber.from(value)).toString(),
      },
      blockNumber,
      eventName,
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
    const oldBalance = await this.getBalance(user);

    if (oldBalance !== null) {
      await this.updateBalanceAndNotify(
        user,
        {
          claimedRewardPerShare1e18: value.toString(),
        },
        blockNumber,
        eventName,
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
    );
  }

  async onIncreasedCurrentRewardPerShareEvent(
    session: ClientSession,
    [value]: any[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {
    const jsonModel = this.getLastState();

    const update = {
      currentRewardPerShare1e18: BigNumber.from(jsonModel.currentRewardPerShare1e18)
        .add(BigNumber.from(value))
        .toString(),
    };

    await this.applyUpdateAndNotify(update, blockNumber, eventName);
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
    const jsonModel = this.getLastState();

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

    await this.applyUpdateAndNotify(update, blockNumber, eventName);
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
    );
  }

  async onDecreasedPartiallyChargedBalanceEvent(
    session: ClientSession,
    [user, value]: any[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {
    const oldBalance = await this.getBalance(user);

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
    const jsonModel = this.getLastState();

    const update = {
      stakedLT: BigNumber.from(jsonModel.stakedLT).sub(BigNumber.from(value)).toString(),
    };

    await this.applyUpdateAndNotify(update, blockNumber, eventName);
  }

  async onTokensDischargedEvent(
    session: ClientSession,
    [user, partiallyChargedBalance]: any[],
    blockNumber: number,
    eventName?: string,
  ): Promise<void> {
    const oldBalance = await this.getBalance(user);

    if (oldBalance !== null) {
      await this.updateBalanceAndNotify(
        user,
        {
          fullyChargedBalance: "0",
          partiallyChargedBalance: partiallyChargedBalance.toString(),
        },
        blockNumber,
        eventName,
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
    );
  }
}
