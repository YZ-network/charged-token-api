import { ethers } from "ethers";
import { ClientSession } from "mongoose";
import { EventHandlerStatus } from "../globals";

export interface IContract {
  chainId: number;
  address: string;
  lastUpdateBlock: number;
}

export interface IOwnable extends IContract {
  owner: string;
}

export interface IErc20 extends IOwnable {
  name: string;
  symbol: string;
  decimals: string;
  totalSupply: string;
}

interface IChargedTokenConstants {
  fractionInitialUnlockPerThousand: string;
  durationCliff: string;
  durationLinearVesting: string;
  maxInitialTokenAllocation: string;
  maxWithdrawFeesPerThousandForLT: string;
  maxClaimFeesPerThousandForPT: string;
  maxStakingAPR: string;
  maxStakingTokenAmount: string;
}

interface IChargedTokenStaking {
  stakingStartDate: string;
  stakingDuration: string;
  stakingDateLastCheckpoint: string;
  campaignStakingRewards: string;
  totalStakingRewards: string;
}

interface IChargedTokenToggles {
  areUserFunctionsDisabled: boolean;
  isInterfaceProjectTokenLocked: boolean;
  areAllocationsTerminated: boolean;
}

interface IChargedTokenFundraising {
  fundraisingTokenSymbol: string;
  priceTokenPer1e18: string;
  fundraisingToken: string;
  isFundraisingActive: boolean;
}

export interface IChargedToken
  extends IChargedTokenConstants,
    IChargedTokenToggles,
    IChargedTokenStaking,
    IChargedTokenFundraising,
    IErc20 {
  interfaceProjectToken: string;
  ratioFeesToRewardHodlersPerThousand: string;
  currentRewardPerShare1e18: string;
  stakedLT: string;
  totalLocked: string;
  totalTokenAllocated: string;
  withdrawFeesPerThousandForLT: string;
  isFundraisingContract: boolean;
}

export interface IDelegableToLT extends IErc20 {
  validatedInterfaceProjectToken: string[];
  isListOfInterfaceProjectTokenComplete: boolean;
}

export interface IDirectory extends IOwnable {
  directory: string[];
  whitelistedProjectOwners: string[];
  projects: string[];
  projectRelatedToLT: Record<string, string>;
  whitelist: Record<string, string>;
  areUserFunctionsDisabled: boolean;
}

export interface IInterfaceProjectToken extends IOwnable {
  liquidityToken: string;
  projectToken: string;
  dateLaunch: string;
  dateEndCliff: string;
  claimFeesPerThousandForPT: string;
}

export interface IChargedTokenBalance {
  balance: string;
  balancePT: string;
  fullyChargedBalance: string;
  partiallyChargedBalance: string;
  dateOfPartiallyCharged: string;
  claimedRewardPerShare1e18: string;
  valueProjectTokenToFullRecharge: string;
}

export interface IUserBalance extends IChargedTokenBalance {
  chainId: number;
  lastUpdateBlock: number;
  user: string;
  address: string;
  ptAddress: string;
}

export interface IEvent {
  status: EventHandlerStatus;
  chainId: number;
  address: string;
  blockNumber: number;
  blockDate: string;
  txHash: string;
  txIndex: number;
  logIndex: number;
  name: string;
  contract: string;
  topics: string[];
  args: string[];
}

export enum DataType {
  ChargedToken = "ChargedToken",
  Directory = "Directory",
  InterfaceProjectToken = "InterfaceProjectToken",
  DelegableToLT = "DelegableToLT",
  UserBalance = "UserBalance",
  Event = "Event",
}

export const EMPTY_ADDRESS = "0x0000000000000000000000000000000000000000";

export { BigNumber } from "ethers";

export { type Logger } from "pino";

export { type ClientSession } from "mongoose";

export type IEventHandler = (
  session: ClientSession,
  args: any[],
  blockNumber: number,
  eventName: string,
) => Promise<void>;

export type Log = ethers.providers.Log;
