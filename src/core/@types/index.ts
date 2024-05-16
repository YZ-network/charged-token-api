type DataType = "ChargedToken" | "Directory" | "InterfaceProjectToken" | "DelegableToLT" | "UserBalance" | "Event";

type EventHandlerStatus = "QUEUED" | "SUCCESS" | "FAILURE";

type ProviderStatus = "STARTING" | "CONNECTING" | "CONNECTED" | "DISCONNECTED";

type WorkerStatus = "WAITING" | "STARTED" | "DEAD";

interface IParsedBlock {
  chainId: number;
  lastUpdateBlock: number;
}

interface IContract {
  chainId: number;
  address: string;
  lastUpdateBlock: number;
}

interface IOwnable extends IContract {
  owner: string;
}

interface IErc20 extends IOwnable {
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

interface IChargedToken
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

interface IDelegableToLT extends IErc20 {
  validatedInterfaceProjectToken: string[];
  isListOfInterfaceProjectTokenComplete: boolean;
}

interface IDirectory extends IOwnable {
  directory: string[];
  whitelistedProjectOwners: string[];
  projects: string[];
  projectRelatedToLT: Record<string, string>;
  whitelist: Record<string, string>;
  areUserFunctionsDisabled: boolean;
}

interface IInterfaceProjectToken extends IOwnable {
  liquidityToken: string;
  projectToken: string;
  dateLaunch: string;
  dateEndCliff: string;
  claimFeesPerThousandForPT: string;
}

interface IChargedTokenBalance {
  balance: string;
  balancePT: string;
  fullyChargedBalance: string;
  partiallyChargedBalance: string;
  dateOfPartiallyCharged: string;
  claimedRewardPerShare1e18: string;
  valueProjectTokenToFullRecharge: string;
}

interface IUserBalance extends IChargedTokenBalance {
  chainId: number;
  lastUpdateBlock: number;
  user: string;
  address: string;
  ptAddress: string;
}

interface IEvent {
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

interface ChainHealth {
  index: number;
  rpc: string;
  directory: string;
  name?: string;
  chainId?: number;
  providerStatus: ProviderStatus;
  workerStatus: WorkerStatus;
  wsStatus: string;
  restartCount: number;
}

interface JsonDbConfig {
  uri: string;
}

interface JsonApiConfig {
  bindAddress: string;
  bindPort: number;
  corsOrigins: string;
  logLevel: string;
  enableGraphiql: boolean;
}

interface JsonNetworkConfig {
  chainId: number;
  uri: string;
  directory: string;
  enabled?: boolean;
}

interface JsonDelaysConfig {
  workerRestartDelayMs: number;
  rpcMaxParallelRequests: number;
  rpcMaxRetryCount: number;
  rpcPingDelayMs: number;
  rpcPongMaxWaitMs: number;
  rpcRetryDelayMs: number;
  nodeDownAlertDelayMs: number;
}

interface JsonBlocksConfig {
  lag: number;
  buffer: number;
}

interface JsonConfig {
  db: JsonDbConfig;
  api: JsonApiConfig;
  networks: JsonNetworkConfig[];
  delays: JsonDelaysConfig;
  blocks: JsonBlocksConfig;
}

interface Log {
  blockNumber: number;
  blockHash: string;
  transactionIndex: number;

  removed: boolean;

  address: string;
  data: string;

  topics: Array<string>;

  transactionHash: string;
  logIndex: number;
}
