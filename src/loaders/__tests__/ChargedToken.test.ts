import { ClientSession } from "mongodb";
import { FlattenMaps } from "mongoose";
import { type IChargedToken, type IUserBalance } from "../../models";
import pubSub from "../../pubsub";
import { DataType, EMPTY_ADDRESS } from "../../types";
import { AbstractBlockchainRepository } from "../AbstractBlockchainRepository";
import { AbstractDbRepository } from "../AbstractDbRepository";
import { ChargedToken } from "../ChargedToken";
import { Directory } from "../Directory";
import { MockBlockchainRepository } from "../__mocks__/MockBlockchainRepository";
import { MockDbRepository } from "../__mocks__/MockDbRepository";

jest.mock("../../globals/config");
jest.mock("../../topics");
jest.mock("../../pubsub");
jest.mock("../../models");
jest.mock("../Directory");
jest.mock("../InterfaceProjectToken");

describe("ChargedToken loader", () => {
  const CHAIN_ID = 1337;
  const OWNER = "0x493942A95Bc6Db03CE8Cc22ff5a0441Dcc581f45";
  const ADDRESS = "0xF79A6c67E99b2135E09C3Ba0d06AE60977C1f393";
  const NAME = "Test CT";
  const SYMBOL = "TCT";
  const INTERFACE_ADDR = "0xIFACE";
  const BLOCK_NUMBER = 15;

  let blockchain: jest.Mocked<AbstractBlockchainRepository>;
  let db: jest.Mocked<AbstractDbRepository>;
  let directoryLoader: Directory;
  let loader: ChargedToken;
  let session: ClientSession;

  beforeEach(() => {
    blockchain = new MockBlockchainRepository() as jest.Mocked<AbstractBlockchainRepository>;
    db = new MockDbRepository() as jest.Mocked<AbstractDbRepository>;
    directoryLoader = new Directory(CHAIN_ID, blockchain, ADDRESS, db as unknown as AbstractDbRepository);
    loader = new ChargedToken(CHAIN_ID, blockchain, ADDRESS, directoryLoader, db as unknown as AbstractDbRepository);
    session = new ClientSession();
  });

  function sampleData(): IChargedToken {
    return {
      chainId: CHAIN_ID,
      lastUpdateBlock: BLOCK_NUMBER,
      address: ADDRESS,
      owner: OWNER,
      name: NAME,
      symbol: SYMBOL,
      decimals: "18",
      totalSupply: "1",
      fractionInitialUnlockPerThousand: "2",
      durationCliff: "3",
      durationLinearVesting: "4",
      maxInitialTokenAllocation: "5",
      maxWithdrawFeesPerThousandForLT: "6",
      maxClaimFeesPerThousandForPT: "7",
      maxStakingAPR: "8",
      maxStakingTokenAmount: "9",
      areUserFunctionsDisabled: true,
      isInterfaceProjectTokenLocked: false,
      areAllocationsTerminated: false,
      interfaceProjectToken: INTERFACE_ADDR,
      ratioFeesToRewardHodlersPerThousand: "11",
      currentRewardPerShare1e18: "12",
      stakedLT: "13",
      totalLocked: "14",
      totalTokenAllocated: "15",
      withdrawFeesPerThousandForLT: "16",
      stakingStartDate: "17",
      stakingDuration: "18",
      stakingDateLastCheckpoint: "19",
      campaignStakingRewards: "20",
      totalStakingRewards: "21",
      isFundraisingContract: false,
      fundraisingToken: EMPTY_ADDRESS,
      fundraisingTokenSymbol: "",
      isFundraisingActive: false,
      priceTokenPer1e18: "0",
    };
  }

  test("Should initialize ChargedToken by reading blockchain when not in db", async () => {
    // checking constructor
    expect(loader.chainId).toBe(CHAIN_ID);
    expect(loader.address).toBe(ADDRESS);
    expect(loader.lastState).toEqual(undefined);

    // mocking ethers
    const BLOCK_NUMBER = 15;

    // mocking mongo model
    const graphqlModel = sampleData();

    db.get.mockResolvedValueOnce(null);
    db.exists.mockResolvedValueOnce(false);
    db.get.mockResolvedValueOnce(graphqlModel);

    // mocking contract instance
    blockchain.loadChargedToken.mockResolvedValueOnce(graphqlModel);

    // tested function
    await loader.init(session, BLOCK_NUMBER, true);

    // expectations
    expect(loader.lastState).toEqual(graphqlModel);

    expect(db.exists).toBeCalledTimes(1);
    expect(db.get).toHaveBeenNthCalledWith(2, DataType.ChargedToken, CHAIN_ID, ADDRESS);
    expect(db.save).toHaveBeenCalledTimes(1);

    expect(loader.interface).toBeDefined();
    expect(loader.interface?.init).toBeCalledTimes(1);

    expect(blockchain.loadChargedToken).toBeCalledTimes(1);
    expect(blockchain.loadAndSyncEvents).toBeCalledTimes(0);

    expect((session as any).startTransaction).toBeCalledTimes(1);
    expect((session as any).commitTransaction).toBeCalledTimes(1);
  });

  test("Should use events to update existing ChargedToken from db", async () => {
    // mocking ethers
    const ACTUAL_BLOCK_NUMBER = 20;

    // mocking mongo model
    const loadedModel = sampleData();

    db.get.mockResolvedValueOnce(loadedModel);

    // tested function
    await loader.init(session, ACTUAL_BLOCK_NUMBER, true);

    // expectations
    expect(loader.lastState).toEqual(loadedModel);

    expect(db.exists).toBeCalledTimes(0);
    expect(db.get).toHaveBeenNthCalledWith(1, DataType.ChargedToken, CHAIN_ID, ADDRESS);
    expect(db.save).toHaveBeenCalledTimes(0);

    expect(loader.interface).toBeDefined();
    expect(loader.interface?.init).toBeCalledTimes(1);

    expect(blockchain.loadChargedToken).toBeCalledTimes(0);
    expect(blockchain.loadAndSyncEvents).toBeCalledTimes(1);

    expect(loader.lastState).toEqual(loadedModel);

    expect((session as any).startTransaction).toBeCalledTimes(1);
    expect((session as any).commitTransaction).toBeCalledTimes(1);
  });

  test("Should not initialize InterfaceProjectToken if not set", async () => {
    // mocking mongo model
    const loadedModel = {
      ...sampleData(),
      interfaceProjectToken: EMPTY_ADDRESS,
    };

    db.get.mockResolvedValueOnce(loadedModel);

    // tested function
    await loader.init(session, BLOCK_NUMBER, true);

    // expectations
    expect(loader.interface).toBeUndefined();
  });

  function sampleBalance(user: string, blockNumber: number = 0): IUserBalance {
    return {
      chainId: CHAIN_ID,
      user,
      address: ADDRESS,
      ptAddress: "",
      lastUpdateBlock: blockNumber,
      balance: "1",
      balancePT: "0",
      fullyChargedBalance: "2",
      partiallyChargedBalance: "3",
      dateOfPartiallyCharged: "4",
      claimedRewardPerShare1e18: "5",
      valueProjectTokenToFullRecharge: "0",
    };
  }

  test("Should load user balances from blockchain", async () => {
    const user = "0xUSER";

    // mocking ethers
    const ACTUAL_BLOCK_NUMBER = 20;

    // mocking contract
    const expectedBalances = sampleBalance(user, ACTUAL_BLOCK_NUMBER);

    blockchain.loadUserBalances.mockResolvedValueOnce(expectedBalances);

    const actualBalances = await loader.loadUserBalances(user, ACTUAL_BLOCK_NUMBER);

    expect(actualBalances).toEqual(expectedBalances);

    expect(blockchain.loadUserBalances).toHaveBeenNthCalledWith(
      1,
      ACTUAL_BLOCK_NUMBER,
      user,
      ADDRESS,
      undefined,
      undefined,
    );
  });

  test("Should load PT balances when available", async () => {
    const user = "0xUSER";

    // mocking ethers
    const ACTUAL_BLOCK_NUMBER = 20;

    // preparing loader initialization
    const returnedData = { ...sampleData(), interfaceProjectToken: INTERFACE_ADDR };
    db.get.mockResolvedValueOnce(returnedData);

    await loader.init(session, ACTUAL_BLOCK_NUMBER);

    expect(loader.interface).toBeDefined();

    // mocking contract
    const expectedBalances = {
      ...sampleBalance(user, ACTUAL_BLOCK_NUMBER),
      ptAddress: "0xPT",
      valueProjectTokenToFullRecharge: "6",
      balancePT: "7",
    };
    blockchain.loadUserBalances.mockResolvedValueOnce(expectedBalances);

    const actualBalances = await loader.loadUserBalances(user, ACTUAL_BLOCK_NUMBER);

    expect(actualBalances).toEqual(expectedBalances);

    expect(blockchain.loadUserBalances).toHaveBeenNthCalledWith(
      1,
      ACTUAL_BLOCK_NUMBER,
      user,
      ADDRESS,
      undefined,
      expectedBalances.ptAddress,
    );
  });

  test("Should propagate events subscription", async () => {
    loader.subscribeToEvents();

    expect(blockchain.subscribeToEvents).toBeCalledTimes(1);
  });

  // Event handlers
  test("InterfaceProjectTokenIsLocked", async () => {
    const loadedModel = sampleData();

    db.exists.mockResolvedValueOnce(true);
    db.get.mockResolvedValueOnce(loadedModel);

    await loader.onInterfaceProjectTokenIsLockedEvent(session, [], BLOCK_NUMBER, "InterfaceProjectTokenIsLocked");

    expect(db.exists).toBeCalledTimes(1);
    expect(db.get).toBeCalledTimes(1);
    expect(db.update).toHaveBeenCalledWith(DataType.ChargedToken, {
      chainId: CHAIN_ID,
      address: ADDRESS,
      lastUpdateBlock: BLOCK_NUMBER,
      isInterfaceProjectTokenLocked: true,
    });
    expect(pubSub.publish).toHaveBeenCalledWith(`ChargedToken.${CHAIN_ID}.${ADDRESS}`, loadedModel);
    expect(pubSub.publish).toHaveBeenCalledWith(`ChargedToken.${CHAIN_ID}`, loadedModel);
  });

  test("IncreasedTotalTokenAllocated", async () => {
    const loadedModel = sampleData();

    db.get.mockResolvedValue(loadedModel);
    db.exists.mockResolvedValueOnce(true);

    await loader.onIncreasedTotalTokenAllocatedEvent(session, ["10"], BLOCK_NUMBER, "IncreasedTotalTokenAllocated");

    expect(db.exists).toBeCalledTimes(1);
    expect(db.get).toBeCalledTimes(2);
    expect(db.update).toHaveBeenCalledWith(DataType.ChargedToken, {
      chainId: CHAIN_ID,
      address: ADDRESS,
      lastUpdateBlock: BLOCK_NUMBER,
      totalTokenAllocated: "25",
    });
    expect(pubSub.publish).toHaveBeenCalledWith(`ChargedToken.${CHAIN_ID}.${ADDRESS}`, loadedModel);
    expect(pubSub.publish).toHaveBeenCalledWith(`ChargedToken.${CHAIN_ID}`, loadedModel);
  });

  test("UserFunctionsAreDisabled", async () => {
    const updateFunc = jest.spyOn(loader, "applyUpdateAndNotify").mockResolvedValue(undefined);

    await loader.onUserFunctionsAreDisabledEvent(session, [true], BLOCK_NUMBER, "UserFunctionsAreDisabled");

    expect(updateFunc).toBeCalledWith(
      session,
      { areUserFunctionsDisabled: true },
      BLOCK_NUMBER,
      "UserFunctionsAreDisabled",
    );
  });

  test("InterfaceProjectTokenSet", async () => {
    const updateFunc = jest.spyOn(loader, "applyUpdateAndNotify").mockResolvedValue(undefined);
    expect(loader.interface).toBeUndefined();

    await loader.onInterfaceProjectTokenSetEvent(session, ["0xINTERFACE"], BLOCK_NUMBER, "InterfaceProjectTokenSet");

    expect(loader.interface).toBeDefined();
    expect(loader.interface?.init).toBeCalledWith(session, BLOCK_NUMBER, false);
    expect(loader.interface?.subscribeToEvents).toBeCalledTimes(1);
    expect(loader.interface?.setProjectTokenAddressOnBalances).toBeCalledWith(session, ADDRESS, "0xPT", BLOCK_NUMBER);
    expect(updateFunc).toBeCalledWith(
      session,
      { interfaceProjectToken: "0xINTERFACE" },
      BLOCK_NUMBER,
      "InterfaceProjectTokenSet",
    );
  });

  test("IncreasedFullyChargedBalance with existing balance", async () => {
    const loadedBalance = {
      fullyChargedBalance: "100",
    } as any;
    const getBalance = jest.spyOn(loader, "getBalance").mockResolvedValue(loadedBalance);
    const updateFunc = jest.spyOn(loader, "updateBalanceAndNotify").mockResolvedValue(undefined);

    await loader.onIncreasedFullyChargedBalanceEvent(
      session,
      ["0xUSER", "50"],
      BLOCK_NUMBER,
      "IncreasedFullyChargedBalance",
    );

    expect(getBalance).toBeCalledWith(session, ADDRESS, "0xUSER");
    expect(updateFunc).toBeCalledWith(
      session,
      ADDRESS,
      "0xUSER",
      { fullyChargedBalance: "150" },
      BLOCK_NUMBER,
      undefined,
      "IncreasedFullyChargedBalance",
    );
  });

  test("IncreasedFullyChargedBalance without existing balance", async () => {
    const getBalance = jest.spyOn(loader, "getBalance").mockResolvedValue(null);

    await loader.onIncreasedFullyChargedBalanceEvent(
      session,
      ["0xUSER", "50"],
      BLOCK_NUMBER,
      "IncreasedFullyChargedBalance",
    );

    expect(getBalance).toBeCalledWith(session, ADDRESS, "0xUSER");
  });

  test("IncreasedStakedLT", async () => {
    const loadedCT = {
      stakedLT: "100",
    } as any;
    const getJsonModel = jest.spyOn(loader, "getJsonModel").mockResolvedValue(loadedCT);
    const updateFunc = jest.spyOn(loader, "applyUpdateAndNotify").mockResolvedValue(undefined);

    await loader.onIncreasedStakedLTEvent(session, ["50"], BLOCK_NUMBER, "IncreasedStakedLT");

    expect(getJsonModel).toBeCalledWith(session);
    expect(updateFunc).toBeCalledWith(session, { stakedLT: "150" }, BLOCK_NUMBER, "IncreasedStakedLT");
  });

  test("AllocationsAreTerminated", async () => {
    const updateFunc = jest.spyOn(loader, "applyUpdateAndNotify").mockResolvedValue(undefined);

    await loader.onAllocationsAreTerminatedEvent(session, [], BLOCK_NUMBER, "AllocationsAreTerminated");

    expect(updateFunc).toBeCalledWith(
      session,
      { areAllocationsTerminated: true },
      BLOCK_NUMBER,
      "AllocationsAreTerminated",
    );
  });

  test("DecreasedFullyChargedBalanceAndStakedLT without existing balance", async () => {
    const getBalance = jest.spyOn(loader, "getBalance").mockResolvedValue(null);
    const getJsonModel = jest
      .spyOn(loader, "getJsonModel")
      .mockResolvedValue({ stakedLT: "100" } as FlattenMaps<IChargedToken>);
    const updateContractFunc = jest.spyOn(loader, "applyUpdateAndNotify").mockResolvedValue(undefined);

    await loader.onDecreasedFullyChargedBalanceAndStakedLTEvent(
      session,
      ["0xUSER", "50"],
      BLOCK_NUMBER,
      "DecreasedFullyChargedBalanceAndStakedLT",
    );

    expect(getBalance).toBeCalledWith(session, ADDRESS, "0xUSER");
    expect(getJsonModel).toBeCalledWith(session);
    expect(updateContractFunc).toBeCalledWith(
      session,
      { stakedLT: "50" },
      BLOCK_NUMBER,
      "DecreasedFullyChargedBalanceAndStakedLT",
    );
  });

  test("DecreasedFullyChargedBalanceAndStakedLT with existing balance", async () => {
    const loadedBalance = {
      fullyChargedBalance: "100",
    } as any;
    const getBalance = jest.spyOn(loader, "getBalance").mockResolvedValue(loadedBalance);
    const getJsonModel = jest
      .spyOn(loader, "getJsonModel")
      .mockResolvedValue({ stakedLT: "100" } as FlattenMaps<IChargedToken>);
    const updateBalanceFunc = jest.spyOn(loader, "updateBalanceAndNotify").mockResolvedValue(undefined);
    const updateContractFunc = jest.spyOn(loader, "applyUpdateAndNotify").mockResolvedValue(undefined);

    await loader.onDecreasedFullyChargedBalanceAndStakedLTEvent(
      session,
      ["0xUSER", "50"],
      BLOCK_NUMBER,
      "DecreasedFullyChargedBalanceAndStakedLT",
    );

    expect(getBalance).toBeCalledWith(session, ADDRESS, "0xUSER");
    expect(updateBalanceFunc).toBeCalledWith(
      session,
      ADDRESS,
      "0xUSER",
      { fullyChargedBalance: "50" },
      BLOCK_NUMBER,
      undefined,
      "DecreasedFullyChargedBalanceAndStakedLT",
    );

    expect(getJsonModel).toBeCalledWith(session);
    expect(updateContractFunc).toBeCalledWith(
      session,
      { stakedLT: "50" },
      BLOCK_NUMBER,
      "DecreasedFullyChargedBalanceAndStakedLT",
    );
  });

  test("ClaimedRewardPerShareUpdated", async () => {
    const loadedBalance = {
      claimedRewardPerShare1e18: "100",
    } as any;
    const getBalance = jest.spyOn(loader, "getBalance").mockResolvedValue(loadedBalance);
    const updateBalanceFunc = jest.spyOn(loader, "updateBalanceAndNotify").mockResolvedValue(undefined);

    await loader.onClaimedRewardPerShareUpdatedEvent(
      session,
      ["0xUSER", "50"],
      BLOCK_NUMBER,
      "ClaimedRewardPerShareUpdated",
    );

    expect(getBalance).toBeCalledWith(session, ADDRESS, "0xUSER");
    expect(updateBalanceFunc).toBeCalledWith(
      session,
      ADDRESS,
      "0xUSER",
      { claimedRewardPerShare1e18: "50" },
      BLOCK_NUMBER,
      undefined,
      "ClaimedRewardPerShareUpdated",
    );
  });

  test("CurrentRewardPerShareAndStakingCheckpointUpdated", async () => {
    const updateFunc = jest.spyOn(loader, "applyUpdateAndNotify").mockResolvedValue(undefined);

    await loader.onCurrentRewardPerShareAndStakingCheckpointUpdatedEvent(
      session,
      ["50", "1234"],
      BLOCK_NUMBER,
      "CurrentRewardPerShareAndStakingCheckpointUpdated",
    );

    expect(updateFunc).toBeCalledWith(
      session,
      { currentRewardPerShare1e18: "50", stakingDateLastCheckpoint: "1234" },
      BLOCK_NUMBER,
      "CurrentRewardPerShareAndStakingCheckpointUpdated",
    );
  });

  test("IncreasedCurrentRewardPerShare", async () => {
    const getJsonModel = jest
      .spyOn(loader, "getJsonModel")
      .mockResolvedValue({ currentRewardPerShare1e18: "150" } as FlattenMaps<IChargedToken>);
    const updateFunc = jest.spyOn(loader, "applyUpdateAndNotify").mockResolvedValue(undefined);

    await loader.onIncreasedCurrentRewardPerShareEvent(session, ["50"], BLOCK_NUMBER, "IncreasedCurrentRewardPerShare");

    expect(getJsonModel).toBeCalledWith(session);
    expect(updateFunc).toBeCalledWith(
      session,
      { currentRewardPerShare1e18: "200" },
      BLOCK_NUMBER,
      "IncreasedCurrentRewardPerShare",
    );
  });

  test("StakingCampaignCreated", async () => {
    const getJsonModel = jest
      .spyOn(loader, "getJsonModel")
      .mockResolvedValue({ totalStakingRewards: "100", totalTokenAllocated: "200" } as FlattenMaps<IChargedToken>);
    const updateFunc = jest.spyOn(loader, "applyUpdateAndNotify").mockResolvedValue(undefined);

    await loader.onStakingCampaignCreatedEvent(session, ["10", "20", "30"], BLOCK_NUMBER, "StakingCampaignCreated");

    expect(getJsonModel).toBeCalledWith(session);
    expect(updateFunc).toBeCalledWith(
      session,
      {
        stakingStartDate: "10",
        stakingDateLastCheckpoint: "10",
        stakingDuration: "20",
        campaignStakingRewards: "30",
        totalStakingRewards: "130",
        totalTokenAllocated: "230",
      },
      BLOCK_NUMBER,
      "StakingCampaignCreated",
    );
  });

  test("WithdrawalFeesUpdated", async () => {
    const updateFunc = jest.spyOn(loader, "applyUpdateAndNotify").mockResolvedValue(undefined);

    await loader.onWithdrawalFeesUpdatedEvent(session, ["1234"], BLOCK_NUMBER, "WithdrawalFeesUpdated");

    expect(updateFunc).toBeCalledWith(
      session,
      {
        withdrawFeesPerThousandForLT: "1234",
      },
      BLOCK_NUMBER,
      "WithdrawalFeesUpdated",
    );
  });

  test("RatioFeesToRewardHodlersUpdated", async () => {
    const updateFunc = jest.spyOn(loader, "applyUpdateAndNotify").mockResolvedValue(undefined);

    await loader.onRatioFeesToRewardHodlersUpdatedEvent(
      session,
      ["1234"],
      BLOCK_NUMBER,
      "RatioFeesToRewardHodlersUpdated",
    );

    expect(updateFunc).toBeCalledWith(
      session,
      {
        ratioFeesToRewardHodlersPerThousand: "1234",
      },
      BLOCK_NUMBER,
      "RatioFeesToRewardHodlersUpdated",
    );
  });

  test("DecreasedPartiallyChargedBalance", async () => {
    const loadedBalance = {
      partiallyChargedBalance: "150",
    } as any;
    const getBalance = jest.spyOn(loader, "getBalance").mockResolvedValue(loadedBalance);
    const updateBalanceFunc = jest.spyOn(loader, "updateBalanceAndNotify").mockResolvedValue(undefined);

    await loader.onDecreasedPartiallyChargedBalanceEvent(
      session,
      ["0xUSER", "100"],
      BLOCK_NUMBER,
      "DecreasedPartiallyChargedBalance",
    );

    expect(getBalance).toBeCalledWith(session, ADDRESS, "0xUSER");
    expect(updateBalanceFunc).toBeCalledWith(
      session,
      ADDRESS,
      "0xUSER",
      { partiallyChargedBalance: "50" },
      BLOCK_NUMBER,
      undefined,
      "DecreasedPartiallyChargedBalance",
    );
  });

  test("UpdatedDateOfPartiallyChargedAndDecreasedStakedLT", async () => {
    const loadedModel = { stakedLT: "150" } as any;
    const getJsonModel = jest.spyOn(loader, "getJsonModel").mockResolvedValue(loadedModel);
    const updateFunc = jest.spyOn(loader, "applyUpdateAndNotify").mockResolvedValue(undefined);

    await loader.onUpdatedDateOfPartiallyChargedAndDecreasedStakedLTEvent(
      session,
      ["1234", "50"],
      BLOCK_NUMBER,
      "UpdatedDateOfPartiallyChargedAndDecreasedStakedLT",
    );

    expect(getJsonModel).toBeCalledWith(session);
    expect(updateFunc).toBeCalledWith(
      session,
      {
        stakedLT: "100",
      },
      BLOCK_NUMBER,
      "UpdatedDateOfPartiallyChargedAndDecreasedStakedLT",
    );
  });

  test("TokensDischarged", async () => {
    const loadedBalance = {} as any;
    const getBalance = jest.spyOn(loader, "getBalance").mockResolvedValue(loadedBalance);
    const updateBalanceFunc = jest.spyOn(loader, "updateBalanceAndNotify").mockResolvedValue(undefined);

    await loader.onTokensDischargedEvent(session, ["0xUSER", "100"], BLOCK_NUMBER, "TokensDischarged");

    expect(getBalance).toBeCalledWith(session, ADDRESS, "0xUSER");
    expect(updateBalanceFunc).toBeCalledWith(
      session,
      ADDRESS,
      "0xUSER",
      { fullyChargedBalance: "0", partiallyChargedBalance: "100" },
      BLOCK_NUMBER,
      undefined,
      "TokensDischarged",
    );
  });

  // Transfer use cases
  test("Transfer: empty value should do nothing", async () => {
    await loader.onTransferEvent(session, ["0xFROM", "0xTO", "0"], BLOCK_NUMBER, "Transfer");
  });

  test("Transfer: p2p transfers should update both balances", async () => {
    const fromBalance = { balance: "150" } as any;
    const toBalance = { balance: "60" } as any;
    const getBalance = jest
      .spyOn(loader, "getBalance")
      .mockResolvedValueOnce(fromBalance)
      .mockResolvedValueOnce(toBalance);
    const updateBalance = jest.spyOn(loader, "updateBalanceAndNotify").mockResolvedValue(undefined);

    await loader.onTransferEvent(session, ["0xFROM", "0xTO", "10"], BLOCK_NUMBER, "Transfer");

    expect(getBalance).toHaveBeenNthCalledWith(1, session, ADDRESS, "0xFROM");
    expect(updateBalance).toHaveBeenNthCalledWith(
      1,
      session,
      ADDRESS,
      "0xFROM",
      { balance: "140" },
      BLOCK_NUMBER,
      undefined,
      "Transfer",
    );
    expect(getBalance).toHaveBeenNthCalledWith(2, session, ADDRESS, "0xTO");
    expect(updateBalance).toHaveBeenNthCalledWith(
      2,
      session,
      ADDRESS,
      "0xTO",
      { balance: "70" },
      BLOCK_NUMBER,
      undefined,
      "Transfer",
    );
  });

  test("Transfer: withdraw should increase user balance and decrease totalLocked", async () => {
    const userBalance = { balance: "60" } as any;
    const getBalance = jest.spyOn(loader, "getBalance").mockResolvedValueOnce(userBalance);
    const contract = { totalLocked: "1000" } as any;
    const getJsonModel = jest.spyOn(loader, "getJsonModel").mockResolvedValue(contract);
    const updateBalance = jest.spyOn(loader, "updateBalanceAndNotify").mockResolvedValue(undefined);
    const updateContract = jest.spyOn(loader, "applyUpdateAndNotify").mockResolvedValue(undefined);

    await loader.onTransferEvent(session, [ADDRESS, "0xTO", "10"], BLOCK_NUMBER, "Transfer");

    expect(getBalance).toHaveBeenNthCalledWith(1, session, ADDRESS, "0xTO");
    expect(updateBalance).toHaveBeenNthCalledWith(
      1,
      session,
      ADDRESS,
      "0xTO",
      { balance: "70" },
      BLOCK_NUMBER,
      undefined,
      "Transfer",
    );
    expect(getJsonModel).toHaveBeenCalledWith(session);
    expect(updateContract).toHaveBeenCalledWith(session, { totalLocked: "990" }, BLOCK_NUMBER, "Transfer");
  });

  test("Transfer: deposit should decrease user balance and increase totalLocked", async () => {
    const userBalance = { balance: "60" } as any;
    const getBalance = jest.spyOn(loader, "getBalance").mockResolvedValueOnce(userBalance);
    const contract = { totalLocked: "1000" } as any;
    const getJsonModel = jest.spyOn(loader, "getJsonModel").mockResolvedValue(contract);
    const updateBalance = jest.spyOn(loader, "updateBalanceAndNotify").mockResolvedValue(undefined);
    const updateContract = jest.spyOn(loader, "applyUpdateAndNotify").mockResolvedValue(undefined);

    await loader.onTransferEvent(session, ["0xFROM", ADDRESS, "10"], BLOCK_NUMBER, "Transfer");

    expect(getBalance).toHaveBeenNthCalledWith(1, session, ADDRESS, "0xFROM");
    expect(updateBalance).toHaveBeenNthCalledWith(
      1,
      session,
      ADDRESS,
      "0xFROM",
      { balance: "50" },
      BLOCK_NUMBER,
      undefined,
      "Transfer",
    );
    expect(getJsonModel).toHaveBeenCalledWith(session);
    expect(updateContract).toHaveBeenCalledWith(session, { totalLocked: "1010" }, BLOCK_NUMBER, "Transfer");
  });

  test("Transfer: mint should increase user balance and totalSupply", async () => {
    const userBalance = { balance: "60" } as any;
    const getBalance = jest.spyOn(loader, "getBalance").mockResolvedValueOnce(userBalance);
    const contract = { totalSupply: "1000" } as any;
    const getJsonModel = jest.spyOn(loader, "getJsonModel").mockResolvedValue(contract);
    const updateBalance = jest.spyOn(loader, "updateBalanceAndNotify").mockResolvedValue(undefined);
    const updateContract = jest.spyOn(loader, "applyUpdateAndNotify").mockResolvedValue(undefined);

    await loader.onTransferEvent(session, [EMPTY_ADDRESS, "0xTO", "10"], BLOCK_NUMBER, "Transfer");

    expect(getBalance).toHaveBeenNthCalledWith(1, session, ADDRESS, "0xTO");
    expect(updateBalance).toHaveBeenNthCalledWith(
      1,
      session,
      ADDRESS,
      "0xTO",
      { balance: "70" },
      BLOCK_NUMBER,
      undefined,
      "Transfer",
    );
    expect(getJsonModel).toHaveBeenCalledWith(session);
    expect(updateContract).toHaveBeenCalledWith(session, { totalSupply: "1010" }, BLOCK_NUMBER, "Transfer");
  });

  test("Transfer: burn should decrease user balance and totalSupply", async () => {
    const userBalance = { balance: "60" } as any;
    const getBalance = jest.spyOn(loader, "getBalance").mockResolvedValueOnce(userBalance);
    const contract = { totalSupply: "1000" } as any;
    const getJsonModel = jest.spyOn(loader, "getJsonModel").mockResolvedValue(contract);
    const updateBalance = jest.spyOn(loader, "updateBalanceAndNotify").mockResolvedValue(undefined);
    const updateContract = jest.spyOn(loader, "applyUpdateAndNotify").mockResolvedValue(undefined);

    await loader.onTransferEvent(session, ["0xFROM", EMPTY_ADDRESS, "10"], BLOCK_NUMBER, "Transfer");

    expect(getBalance).toHaveBeenNthCalledWith(1, session, ADDRESS, "0xFROM");
    expect(updateBalance).toHaveBeenNthCalledWith(
      1,
      session,
      ADDRESS,
      "0xFROM",
      { balance: "50" },
      BLOCK_NUMBER,
      undefined,
      "Transfer",
    );
    expect(getJsonModel).toHaveBeenCalledWith(session);
    expect(updateContract).toHaveBeenCalledWith(session, { totalSupply: "990" }, BLOCK_NUMBER, "Transfer");
  });

  // extraneous events

  test("Approval", async () => {
    // does nothing
    await loader.onApprovalEvent(session, [], BLOCK_NUMBER, "Approval");
  });

  test("LTAllocatedByOwner", async () => {
    // does nothing
    await loader.onLTAllocatedByOwnerEvent(session, [], BLOCK_NUMBER, "LTAllocatedByOwner");
  });

  test("LTReceived", async () => {
    // does nothing
    await loader.onLTReceivedEvent(session, [], BLOCK_NUMBER, "LTReceived");
  });

  test("LTDeposited", async () => {
    // does nothing
    await loader.onLTDepositedEvent(session, [], BLOCK_NUMBER, "LTDeposited");
  });

  // Fundraising event handlers
  test("FundraisingConditionsSet", async () => {
    const loadedModel = sampleData();

    db.exists.mockResolvedValueOnce(true);
    db.get.mockResolvedValueOnce(loadedModel);

    await loader.onFundraisingConditionsSetEvent(
      session,
      ["0xfundlowering", "YYY", "55"],
      BLOCK_NUMBER,
      "FundraisingConditionsSet",
    );

    expect(db.get).toBeCalledTimes(1);
    expect(db.update).toHaveBeenCalledWith(DataType.ChargedToken, {
      chainId: CHAIN_ID,
      address: ADDRESS,
      lastUpdateBlock: BLOCK_NUMBER,
      fundraisingToken: "0xfundlowering",
      fundraisingTokenSymbol: "YYY",
      priceTokenPer1e18: "55",
    });
    expect(pubSub.publish).toHaveBeenCalledWith(`ChargedToken.${CHAIN_ID}.${ADDRESS}`, loadedModel);
    expect(pubSub.publish).toHaveBeenCalledWith(`ChargedToken.${CHAIN_ID}`, loadedModel);
  });

  test("FundraisingStatusChanged", async () => {
    const loadedModel = sampleData();

    db.exists.mockResolvedValueOnce(true);
    db.get.mockResolvedValueOnce(loadedModel);
    blockchain.getChargedTokenFundraisingStatus.mockResolvedValueOnce(true);

    await loader.onFundraisingStatusChangedEvent(session, [], BLOCK_NUMBER, "FundraisingStatusChanged");

    expect(blockchain.getChargedTokenFundraisingStatus).toBeCalledTimes(1);
    expect(db.get).toBeCalledTimes(1);
    expect(db.update).toHaveBeenCalledWith(DataType.ChargedToken, {
      chainId: CHAIN_ID,
      address: ADDRESS,
      lastUpdateBlock: BLOCK_NUMBER,
      isFundraisingActive: true,
    });
    expect(pubSub.publish).toHaveBeenCalledWith(`ChargedToken.${CHAIN_ID}.${ADDRESS}`, loadedModel);
    expect(pubSub.publish).toHaveBeenCalledWith(`ChargedToken.${CHAIN_ID}`, loadedModel);
  });

  // extraneous events

  test("LTAllocatedThroughSale", async () => {
    // does nothing
    await loader.onLTAllocatedThroughSaleEvent(session, [], BLOCK_NUMBER, "LTAllocatedThroughSale");
  });
});
