import { BigNumber, ethers } from "ethers";
import { ClientSession } from "mongodb";
import { FlattenMaps } from "mongoose";
import { pubSub } from "../../graphql";
import { type IChargedToken, type IUserBalance } from "../../models";
import { EMPTY_ADDRESS } from "../../types";
import { ChargedToken } from "../ChargedToken";
import { Directory } from "../Directory";
import { EventListener } from "../EventListener";
import { InterfaceProjectToken } from "../InterfaceProjectToken";

jest.mock("../../globals/config");
jest.mock("../EventListener");
jest.mock("../../topics");
jest.mock("../../graphql");
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

  function sampleData(): IChargedToken {
    return {
      chainId: CHAIN_ID,
      initBlock: BLOCK_NUMBER,
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

  function prepareContractMock(loader: ChargedToken) {
    loader.instance.owner.mockResolvedValueOnce(OWNER);
    loader.instance.name.mockResolvedValueOnce(NAME);
    loader.instance.symbol.mockResolvedValueOnce(SYMBOL);
    loader.instance.decimals.mockResolvedValueOnce(BigNumber.from(18));
    loader.instance.totalSupply.mockResolvedValueOnce(BigNumber.from(1));
    loader.instance.fractionInitialUnlockPerThousand.mockResolvedValueOnce(BigNumber.from(2));
    loader.instance.durationCliff.mockResolvedValueOnce(BigNumber.from(3));
    loader.instance.durationLinearVesting.mockResolvedValueOnce(BigNumber.from(4));
    loader.instance.maxInitialTokenAllocation.mockResolvedValueOnce(BigNumber.from(5));
    loader.instance.maxWithdrawFeesPerThousandForLT.mockResolvedValueOnce(BigNumber.from(6));
    loader.instance.maxClaimFeesPerThousandForPT.mockResolvedValueOnce(BigNumber.from(7));
    loader.instance.maxStakingAPR.mockResolvedValueOnce(BigNumber.from(8));
    loader.instance.maxStakingTokenAmount.mockResolvedValueOnce(BigNumber.from(9));
    loader.instance.areUserFunctionsDisabled.mockResolvedValueOnce(true);
    loader.instance.isInterfaceProjectTokenLocked.mockResolvedValueOnce(false);
    loader.instance.areAllocationsTerminated.mockResolvedValueOnce(false);
    loader.instance.interfaceProjectToken.mockResolvedValueOnce(INTERFACE_ADDR);
    loader.instance.ratioFeesToRewardHodlersPerThousand.mockResolvedValueOnce(BigNumber.from(11));
    loader.instance.currentRewardPerShare1e18.mockResolvedValueOnce(BigNumber.from(12));
    loader.instance.stakedLT.mockResolvedValueOnce(BigNumber.from(13));
    loader.instance.balanceOf.mockResolvedValueOnce(BigNumber.from(14));
    loader.instance.totalTokenAllocated.mockResolvedValueOnce(BigNumber.from(15));
    loader.instance.withdrawFeesPerThousandForLT.mockResolvedValueOnce(BigNumber.from(16));
    loader.instance.stakingStartDate.mockResolvedValueOnce(BigNumber.from(17));
    loader.instance.stakingDuration.mockResolvedValueOnce(BigNumber.from(18));
    loader.instance.stakingDateLastCheckpoint.mockResolvedValueOnce(BigNumber.from(19));
    loader.instance.campaignStakingRewards.mockResolvedValueOnce(BigNumber.from(20));
    loader.instance.totalStakingRewards.mockResolvedValueOnce(BigNumber.from(21));
  }

  test("Should initialize ChargedToken by reading blockchain when not in db", async () => {
    // initialization
    const provider = new ethers.providers.JsonRpcProvider();
    const directoryLoader = new Directory(undefined as unknown as EventListener, CHAIN_ID, provider, ADDRESS);
    const loader = new ChargedToken(CHAIN_ID, provider, ADDRESS, directoryLoader);
    const session = new ClientSession();

    // checking constructor
    expect(loader.chainId).toBe(CHAIN_ID);
    expect(loader.provider).toBe(provider);
    expect(loader.eventsListener).toBe(directoryLoader.eventsListener);
    expect(loader.address).toBe(ADDRESS);
    expect(loader.initBlock).toBe(0);
    expect(loader.lastUpdateBlock).toBe(0);
    expect(loader.lastState).toEqual(undefined);

    // mocking ethers
    const BLOCK_NUMBER = 15;

    (provider as any).getBlockNumber.mockResolvedValueOnce(BLOCK_NUMBER);

    // mocking mongo model
    const graphqlModel = sampleData();

    const modelInstanceMock = { save: jest.fn() };
    (loader.model as any).toModel.mockReturnValueOnce(modelInstanceMock);
    (loader.model as any).exists.mockResolvedValueOnce(null);
    (loader.model as any).toGraphQL.mockReturnValueOnce(graphqlModel);

    // mocking contract instance
    prepareContractMock(loader);

    // tested function
    await loader.init(session, BLOCK_NUMBER, true);

    // expectations
    expect(loader.initBlock).toBe(BLOCK_NUMBER);
    expect(loader.lastUpdateBlock).toBe(BLOCK_NUMBER);
    expect(loader.lastState).toEqual(graphqlModel);

    expect((loader.model as any).exists).toBeCalledTimes(1);
    expect((loader.model as any).findOne).toHaveBeenNthCalledWith(
      2,
      {
        chainId: CHAIN_ID,
        address: ADDRESS,
      },
      undefined,
      { session },
    );
    expect((loader.model as any).toModel).toBeCalledTimes(1);
    expect((loader.model as any).toGraphQL).toBeCalledTimes(1);
    expect(modelInstanceMock.save).toHaveBeenCalledTimes(1);

    expect(loader.interface).toBeDefined();
    expect(loader.interface?.init).toBeCalledTimes(1);

    expect(loader.instance.owner).toBeCalledTimes(1);
    expect(loader.instance.name).toBeCalledTimes(1);
    expect(loader.instance.symbol).toBeCalledTimes(1);
    expect(loader.instance.decimals).toBeCalledTimes(1);
    expect(loader.instance.totalSupply).toBeCalledTimes(1);
    expect(loader.instance.fractionInitialUnlockPerThousand).toBeCalledTimes(1);
    expect(loader.instance.durationCliff).toBeCalledTimes(1);
    expect(loader.instance.durationLinearVesting).toBeCalledTimes(1);
    expect(loader.instance.maxInitialTokenAllocation).toBeCalledTimes(1);
    expect(loader.instance.maxWithdrawFeesPerThousandForLT).toBeCalledTimes(1);
    expect(loader.instance.maxClaimFeesPerThousandForPT).toBeCalledTimes(1);
    expect(loader.instance.maxStakingAPR).toBeCalledTimes(1);
    expect(loader.instance.maxStakingTokenAmount).toBeCalledTimes(1);
    expect(loader.instance.areUserFunctionsDisabled).toBeCalledTimes(1);
    expect(loader.instance.isInterfaceProjectTokenLocked).toBeCalledTimes(1);
    expect(loader.instance.areAllocationsTerminated).toBeCalledTimes(1);
    expect(loader.instance.interfaceProjectToken).toBeCalledTimes(1);
    expect(loader.instance.ratioFeesToRewardHodlersPerThousand).toBeCalledTimes(1);
    expect(loader.instance.currentRewardPerShare1e18).toBeCalledTimes(1);
    expect(loader.instance.stakedLT).toBeCalledTimes(1);
    expect(loader.instance.balanceOf).toHaveBeenNthCalledWith(1, ADDRESS);
    expect(loader.instance.totalTokenAllocated).toBeCalledTimes(1);
    expect(loader.instance.withdrawFeesPerThousandForLT).toBeCalledTimes(1);
    expect(loader.instance.stakingStartDate).toBeCalledTimes(1);
    expect(loader.instance.stakingDuration).toBeCalledTimes(1);
    expect(loader.instance.stakingDateLastCheckpoint).toBeCalledTimes(1);
    expect(loader.instance.campaignStakingRewards).toBeCalledTimes(1);
    expect(loader.instance.totalStakingRewards).toBeCalledTimes(1);
    expect(loader.instance.queryFilter).toBeCalledTimes(0);

    expect((session as any).startTransaction).toBeCalledTimes(1);
    expect((session as any).commitTransaction).toBeCalledTimes(1);
  });

  test("Should use events to update existing ChargedToken from db", async () => {
    // initialization
    const provider = new ethers.providers.JsonRpcProvider();
    const directoryLoader = new Directory(undefined as unknown as EventListener, CHAIN_ID, provider, ADDRESS);
    const loader = new ChargedToken(CHAIN_ID, provider, ADDRESS, directoryLoader);
    const session = new ClientSession();

    // mocking ethers
    const ACTUAL_BLOCK_NUMBER = 20;

    // mocking mongo model
    const loadedModel = sampleData();

    const modelInstanceMock = { save: jest.fn() };
    (loader.model as any).toModel.mockReturnValueOnce(modelInstanceMock);
    (loader.model as any).findOne.mockResolvedValueOnce(loadedModel);
    (loader.model as any).toGraphQL.mockReturnValueOnce(loadedModel);

    // mocking contract instance
    (loader.instance as any).queryFilter.mockResolvedValueOnce([]);

    // tested function
    await loader.init(session, ACTUAL_BLOCK_NUMBER, true);

    // expectations
    expect(loader.initBlock).toBe(BLOCK_NUMBER);
    expect(loader.lastUpdateBlock).toBe(BLOCK_NUMBER);
    expect(loader.lastState).toEqual(loadedModel);

    expect((loader.model as any).exists).toBeCalledTimes(0);
    expect((loader.model as any).findOne).toHaveBeenNthCalledWith(
      1,
      {
        chainId: CHAIN_ID,
        address: ADDRESS,
      },
      undefined,
      { session },
    );
    expect((loader.model as any).toModel).toBeCalledTimes(0);
    expect((loader.model as any).toGraphQL).toBeCalledTimes(1);
    expect(modelInstanceMock.save).toHaveBeenCalledTimes(0);

    expect(loader.interface).toBeDefined();
    expect(loader.interface?.init).toBeCalledTimes(1);

    expect(loader.instance.owner).toBeCalledTimes(0);
    expect(loader.instance.name).toBeCalledTimes(0);
    expect(loader.instance.symbol).toBeCalledTimes(0);
    expect(loader.instance.decimals).toBeCalledTimes(0);
    expect(loader.instance.totalSupply).toBeCalledTimes(0);
    expect(loader.instance.fractionInitialUnlockPerThousand).toBeCalledTimes(0);
    expect(loader.instance.durationCliff).toBeCalledTimes(0);
    expect(loader.instance.durationLinearVesting).toBeCalledTimes(0);
    expect(loader.instance.maxInitialTokenAllocation).toBeCalledTimes(0);
    expect(loader.instance.maxWithdrawFeesPerThousandForLT).toBeCalledTimes(0);
    expect(loader.instance.maxClaimFeesPerThousandForPT).toBeCalledTimes(0);
    expect(loader.instance.maxStakingAPR).toBeCalledTimes(0);
    expect(loader.instance.maxStakingTokenAmount).toBeCalledTimes(0);
    expect(loader.instance.areUserFunctionsDisabled).toBeCalledTimes(0);
    expect(loader.instance.isInterfaceProjectTokenLocked).toBeCalledTimes(0);
    expect(loader.instance.areAllocationsTerminated).toBeCalledTimes(0);
    expect(loader.instance.interfaceProjectToken).toBeCalledTimes(0);
    expect(loader.instance.ratioFeesToRewardHodlersPerThousand).toBeCalledTimes(0);
    expect(loader.instance.currentRewardPerShare1e18).toBeCalledTimes(0);
    expect(loader.instance.stakedLT).toBeCalledTimes(0);
    expect(loader.instance.balanceOf).toBeCalledTimes(0);
    expect(loader.instance.totalTokenAllocated).toBeCalledTimes(0);
    expect(loader.instance.withdrawFeesPerThousandForLT).toBeCalledTimes(0);
    expect(loader.instance.stakingStartDate).toBeCalledTimes(0);
    expect(loader.instance.stakingDuration).toBeCalledTimes(0);
    expect(loader.instance.stakingDateLastCheckpoint).toBeCalledTimes(0);
    expect(loader.instance.campaignStakingRewards).toBeCalledTimes(0);
    expect(loader.instance.totalStakingRewards).toBeCalledTimes(0);
    expect(loader.instance.queryFilter).toBeCalledTimes(1);

    expect(loader.lastState).toEqual(loadedModel);

    expect((session as any).startTransaction).toBeCalledTimes(1);
    expect((session as any).commitTransaction).toBeCalledTimes(1);
  });

  test("Should not initialize InterfaceProjectToken if not set", async () => {
    // initialization
    const provider = new ethers.providers.JsonRpcProvider();
    const directoryLoader = new Directory(undefined as unknown as EventListener, CHAIN_ID, provider, ADDRESS);
    const loader = new ChargedToken(CHAIN_ID, provider, ADDRESS, directoryLoader);
    const session = new ClientSession();

    // mocking contract instance
    (loader.instance as any).queryFilter.mockResolvedValueOnce([]);

    // mocking mongo model
    const loadedModel = {
      ...sampleData(),
      interfaceProjectToken: EMPTY_ADDRESS,
    };

    const modelInstanceMock = { save: jest.fn() };
    (loader.model as any).toModel.mockReturnValueOnce(modelInstanceMock);
    (loader.model as any).findOne.mockResolvedValueOnce(loadedModel);
    (loader.model as any).toGraphQL.mockReturnValueOnce(loadedModel);

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
    // initialization
    const provider = new ethers.providers.JsonRpcProvider();
    const directoryLoader = new Directory(undefined as unknown as EventListener, CHAIN_ID, provider, ADDRESS);
    const loader = new ChargedToken(CHAIN_ID, provider, ADDRESS, directoryLoader);

    const user = "0xUSER";

    // mocking ethers
    const ACTUAL_BLOCK_NUMBER = 20;

    // mocking contract
    const expectedBalances = sampleBalance(user, ACTUAL_BLOCK_NUMBER);

    loader.instance.balanceOf.mockReset().mockResolvedValueOnce(BigNumber.from(expectedBalances.balance));
    loader.instance.getUserFullyChargedBalanceLiquiToken.mockResolvedValueOnce(
      BigNumber.from(expectedBalances.fullyChargedBalance),
    );
    loader.instance.getUserPartiallyChargedBalanceLiquiToken.mockResolvedValueOnce(
      BigNumber.from(expectedBalances.partiallyChargedBalance),
    );
    loader.instance.getUserDateOfPartiallyChargedToken.mockResolvedValueOnce(
      BigNumber.from(expectedBalances.dateOfPartiallyCharged),
    );
    loader.instance.claimedRewardPerShare1e18.mockResolvedValueOnce(
      BigNumber.from(expectedBalances.claimedRewardPerShare1e18),
    );

    const actualBalances = await loader.loadUserBalances(user, ACTUAL_BLOCK_NUMBER);

    expect(actualBalances).toEqual(expectedBalances);

    expect(loader.instance.balanceOf).toHaveBeenNthCalledWith(1, user);
    expect(loader.instance.getUserFullyChargedBalanceLiquiToken).toHaveBeenNthCalledWith(1, user);
    expect(loader.instance.getUserPartiallyChargedBalanceLiquiToken).toHaveBeenNthCalledWith(1, user);
    expect(loader.instance.getUserDateOfPartiallyChargedToken).toHaveBeenNthCalledWith(1, user);
    expect(loader.instance.claimedRewardPerShare1e18).toHaveBeenNthCalledWith(1, user);
  });

  test("Should load PT balances when available", async () => {
    // initialization
    const provider = new ethers.providers.JsonRpcProvider();
    const directoryLoader = new Directory(undefined as unknown as EventListener, CHAIN_ID, provider, ADDRESS);
    const loader = new ChargedToken(CHAIN_ID, provider, ADDRESS, directoryLoader);
    const session = new ClientSession();

    const user = "0xUSER";

    // mocking ethers
    const ACTUAL_BLOCK_NUMBER = 20;

    // preparing loader initialization
    prepareContractMock(loader);

    const returnedData = { ...sampleData(), interfaceProjectToken: INTERFACE_ADDR };

    (loader.model as any).findOne.mockResolvedValueOnce(returnedData);
    (loader.model as any).toGraphQL.mockReturnValueOnce(returnedData);

    (loader.instance as any).queryFilter.mockResolvedValueOnce([]);

    await loader.init(session, ACTUAL_BLOCK_NUMBER);

    expect(loader.interface).toBeDefined();

    // mocking contract
    const expectedBalances = {
      ...sampleBalance(user, ACTUAL_BLOCK_NUMBER),
      ptAddress: "0xPT",
      valueProjectTokenToFullRecharge: "6",
      balancePT: "7",
    };

    loader.instance.balanceOf.mockReset().mockResolvedValueOnce(BigNumber.from(expectedBalances.balance));
    loader.instance.getUserFullyChargedBalanceLiquiToken.mockResolvedValueOnce(
      BigNumber.from(expectedBalances.fullyChargedBalance),
    );
    loader.instance.getUserPartiallyChargedBalanceLiquiToken.mockResolvedValueOnce(
      BigNumber.from(expectedBalances.partiallyChargedBalance),
    );
    loader.instance.getUserDateOfPartiallyChargedToken.mockResolvedValueOnce(
      BigNumber.from(expectedBalances.dateOfPartiallyCharged),
    );
    loader.instance.claimedRewardPerShare1e18.mockResolvedValueOnce(
      BigNumber.from(expectedBalances.claimedRewardPerShare1e18),
    );

    (loader.interface as any).loadUserBalancePT.mockResolvedValueOnce(expectedBalances.balancePT);
    (loader.interface as any).loadValueProjectTokenToFullRecharge.mockResolvedValueOnce(
      expectedBalances.valueProjectTokenToFullRecharge,
    );

    const actualBalances = await loader.loadUserBalances(user, ACTUAL_BLOCK_NUMBER);

    expect(actualBalances).toEqual(expectedBalances);

    expect(loader.instance.balanceOf).toHaveBeenNthCalledWith(1, user);
    expect(loader.instance.getUserFullyChargedBalanceLiquiToken).toHaveBeenNthCalledWith(1, user);
    expect(loader.instance.getUserPartiallyChargedBalanceLiquiToken).toHaveBeenNthCalledWith(1, user);
    expect(loader.instance.getUserDateOfPartiallyChargedToken).toHaveBeenNthCalledWith(1, user);
    expect(loader.instance.claimedRewardPerShare1e18).toHaveBeenNthCalledWith(1, user);

    expect(loader.interface?.loadUserBalancePT).toHaveBeenNthCalledWith(1, user);
    expect(loader.interface?.loadValueProjectTokenToFullRecharge).toHaveBeenNthCalledWith(1, user);
  });

  test("Should propagate events subscription", async () => {
    const provider = new ethers.providers.JsonRpcProvider();
    const eventsListener = new EventListener();
    const loader = new ChargedToken(CHAIN_ID, provider, ADDRESS, { eventsListener } as Directory);

    loader.interface = new InterfaceProjectToken(CHAIN_ID, provider, ADDRESS, { eventsListener } as Directory, loader);

    loader.subscribeToEvents();

    expect(loader.interface.subscribeToEvents).toBeCalledTimes(1);
  });

  test("destroy", async () => {
    // initialization
    const provider = new ethers.providers.JsonRpcProvider();
    const directoryLoader = new Directory(undefined as unknown as EventListener, CHAIN_ID, provider, ADDRESS);
    const loader = new ChargedToken(CHAIN_ID, provider, ADDRESS, directoryLoader);

    loader.interface = new InterfaceProjectToken(CHAIN_ID, provider, ADDRESS, directoryLoader, loader);

    await loader.destroy();

    expect(loader.interface.destroy).toBeCalledTimes(1);
    expect(loader.instance.removeAllListeners).toBeCalledTimes(1);
  });

  // Event handlers
  test("InterfaceProjectTokenIsLocked", async () => {
    // initialization
    const provider = new ethers.providers.JsonRpcProvider();
    const directoryLoader = new Directory(undefined as unknown as EventListener, CHAIN_ID, provider, ADDRESS);
    const loader = new ChargedToken(CHAIN_ID, provider, ADDRESS, directoryLoader);
    const session = new ClientSession();

    const loadedModel = sampleData();

    (loader.model as any).exists.mockResolvedValueOnce("not_null");
    (loader.model as any).toGraphQL.mockReturnValueOnce(loadedModel);

    await loader.onInterfaceProjectTokenIsLockedEvent(session, [], BLOCK_NUMBER, "InterfaceProjectTokenIsLocked");

    expect((loader.model as any).exists).toBeCalledTimes(1);
    expect((loader.model as any).findOne).toBeCalledTimes(1);
    expect((loader.model as any).updateOne).toHaveBeenCalledWith(
      { chainId: CHAIN_ID, address: ADDRESS },
      { lastUpdateBlock: BLOCK_NUMBER, isInterfaceProjectTokenLocked: true },
      { session },
    );
    expect(pubSub.publish).toHaveBeenCalledWith(`ChargedToken.${CHAIN_ID}.${ADDRESS}`, loadedModel);
    expect(pubSub.publish).toHaveBeenCalledWith(`ChargedToken.${CHAIN_ID}`, loadedModel);
  });

  test("IncreasedTotalTokenAllocated", async () => {
    // initialization
    const provider = new ethers.providers.JsonRpcProvider();
    const directoryLoader = new Directory(undefined as unknown as EventListener, CHAIN_ID, provider, ADDRESS);
    const loader = new ChargedToken(CHAIN_ID, provider, ADDRESS, directoryLoader);
    const session = new ClientSession();

    const loadedModel = sampleData();

    const modelInstanceMock = { toJSON: jest.fn(() => loadedModel) };
    (loader.model as any).findOne.mockResolvedValueOnce(modelInstanceMock);

    (loader.model as any).exists.mockResolvedValueOnce("not_null");
    (loader.model as any).toGraphQL.mockReturnValueOnce(loadedModel);

    await loader.onIncreasedTotalTokenAllocatedEvent(session, ["10"], BLOCK_NUMBER, "IncreasedTotalTokenAllocated");

    expect((loader.model as any).exists).toBeCalledTimes(1);
    expect((loader.model as any).findOne).toBeCalledTimes(2);
    expect((loader.model as any).updateOne).toHaveBeenCalledWith(
      { chainId: CHAIN_ID, address: ADDRESS },
      { lastUpdateBlock: BLOCK_NUMBER, totalTokenAllocated: "25" },
      { session },
    );
    expect(pubSub.publish).toHaveBeenCalledWith(`ChargedToken.${CHAIN_ID}.${ADDRESS}`, loadedModel);
    expect(pubSub.publish).toHaveBeenCalledWith(`ChargedToken.${CHAIN_ID}`, loadedModel);
  });

  test("UserFunctionsAreDisabled", async () => {
    // initialization
    const provider = new ethers.providers.JsonRpcProvider();
    const eventsListener = new EventListener();
    const loader = new ChargedToken(CHAIN_ID, provider, ADDRESS, { eventsListener } as Directory);
    const session = new ClientSession();

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
    // initialization
    const provider = new ethers.providers.JsonRpcProvider();
    const eventsListener = new EventListener();
    const loader = new ChargedToken(CHAIN_ID, provider, ADDRESS, { eventsListener } as Directory);
    const session = new ClientSession();

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
    // initialization
    const provider = new ethers.providers.JsonRpcProvider();
    const eventsListener = new EventListener();
    const loader = new ChargedToken(CHAIN_ID, provider, ADDRESS, { eventsListener } as Directory);
    const session = new ClientSession();

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
    // initialization
    const provider = new ethers.providers.JsonRpcProvider();
    const directoryLoader = new Directory(new EventListener(), CHAIN_ID, provider, ADDRESS);
    const loader = new ChargedToken(CHAIN_ID, provider, ADDRESS, directoryLoader);
    const session = new ClientSession();

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
    // initialization
    const provider = new ethers.providers.JsonRpcProvider();
    const eventsListener = new EventListener();
    const loader = new ChargedToken(CHAIN_ID, provider, ADDRESS, { eventsListener } as Directory);
    const session = new ClientSession();

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
    // initialization
    const provider = new ethers.providers.JsonRpcProvider();
    const eventsListener = new EventListener();
    const loader = new ChargedToken(CHAIN_ID, provider, ADDRESS, { eventsListener } as Directory);
    const session = new ClientSession();

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
    // initialization
    const provider = new ethers.providers.JsonRpcProvider();
    const directoryLoader = new Directory(new EventListener(), CHAIN_ID, provider, ADDRESS);
    const loader = new ChargedToken(CHAIN_ID, provider, ADDRESS, directoryLoader);
    const session = new ClientSession();

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
    // initialization
    const provider = new ethers.providers.JsonRpcProvider();
    const eventsListener = new EventListener();
    const loader = new ChargedToken(CHAIN_ID, provider, ADDRESS, { eventsListener } as Directory);
    const session = new ClientSession();

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
    // initialization
    const provider = new ethers.providers.JsonRpcProvider();
    const eventsListener = new EventListener();
    const loader = new ChargedToken(CHAIN_ID, provider, ADDRESS, { eventsListener } as Directory);
    const session = new ClientSession();

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
    // initialization
    const provider = new ethers.providers.JsonRpcProvider();
    const eventsListener = new EventListener();
    const loader = new ChargedToken(CHAIN_ID, provider, ADDRESS, { eventsListener } as Directory);
    const session = new ClientSession();

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
    // initialization
    const provider = new ethers.providers.JsonRpcProvider();
    const eventsListener = new EventListener();
    const loader = new ChargedToken(CHAIN_ID, provider, ADDRESS, { eventsListener } as Directory);
    const session = new ClientSession();

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
    // initialization
    const provider = new ethers.providers.JsonRpcProvider();
    const eventsListener = new EventListener();
    const loader = new ChargedToken(CHAIN_ID, provider, ADDRESS, { eventsListener } as Directory);
    const session = new ClientSession();

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
    // initialization
    const provider = new ethers.providers.JsonRpcProvider();
    const eventsListener = new EventListener();
    const loader = new ChargedToken(CHAIN_ID, provider, ADDRESS, { eventsListener } as Directory);
    const session = new ClientSession();

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
    // initialization
    const provider = new ethers.providers.JsonRpcProvider();
    const eventsListener = new EventListener();
    const loader = new ChargedToken(CHAIN_ID, provider, ADDRESS, { eventsListener } as Directory);
    const session = new ClientSession();

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
    // initialization
    const provider = new ethers.providers.JsonRpcProvider();
    const eventsListener = new EventListener();
    const loader = new ChargedToken(CHAIN_ID, provider, ADDRESS, { eventsListener } as Directory);
    const session = new ClientSession();

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
    // initialization
    const provider = new ethers.providers.JsonRpcProvider();
    const eventsListener = new EventListener();
    const loader = new ChargedToken(CHAIN_ID, provider, ADDRESS, { eventsListener } as Directory);
    const session = new ClientSession();

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
    // initialization
    const provider = new ethers.providers.JsonRpcProvider();
    const eventsListener = new EventListener();
    const loader = new ChargedToken(CHAIN_ID, provider, ADDRESS, { eventsListener } as Directory);
    const session = new ClientSession();

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
    const provider = new ethers.providers.JsonRpcProvider();
    const eventsListener = new EventListener();
    const loader = new ChargedToken(CHAIN_ID, provider, ADDRESS, { eventsListener } as any);
    const session = new ClientSession();

    await loader.onTransferEvent(session, ["0xFROM", "0xTO", "0"], BLOCK_NUMBER, "Transfer");
  });

  test("Transfer: p2p transfers should update both balances", async () => {
    const provider = new ethers.providers.JsonRpcProvider();
    const eventsListener = new EventListener();
    const loader = new ChargedToken(CHAIN_ID, provider, ADDRESS, { eventsListener } as any);
    const session = new ClientSession();

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
    const provider = new ethers.providers.JsonRpcProvider();
    const eventsListener = new EventListener();
    const loader = new ChargedToken(CHAIN_ID, provider, ADDRESS, { eventsListener } as any);
    const session = new ClientSession();

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
    const provider = new ethers.providers.JsonRpcProvider();
    const eventsListener = new EventListener();
    const loader = new ChargedToken(CHAIN_ID, provider, ADDRESS, { eventsListener } as any);
    const session = new ClientSession();

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
    const provider = new ethers.providers.JsonRpcProvider();
    const eventsListener = new EventListener();
    const loader = new ChargedToken(CHAIN_ID, provider, ADDRESS, { eventsListener } as any);
    const session = new ClientSession();

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
    const provider = new ethers.providers.JsonRpcProvider();
    const eventsListener = new EventListener();
    const loader = new ChargedToken(CHAIN_ID, provider, ADDRESS, { eventsListener } as any);
    const session = new ClientSession();

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
    // initialization
    const provider = new ethers.providers.JsonRpcProvider();
    const directoryLoader = new Directory(undefined as unknown as EventListener, CHAIN_ID, provider, ADDRESS);
    const loader = new ChargedToken(CHAIN_ID, provider, ADDRESS, directoryLoader);
    const session = new ClientSession();

    // does nothing
    await loader.onApprovalEvent(session, [], BLOCK_NUMBER, "Approval");
  });

  test("LTAllocatedByOwner", async () => {
    // initialization
    const provider = new ethers.providers.JsonRpcProvider();
    const directoryLoader = new Directory(undefined as unknown as EventListener, CHAIN_ID, provider, ADDRESS);
    const loader = new ChargedToken(CHAIN_ID, provider, ADDRESS, directoryLoader);
    const session = new ClientSession();

    // does nothing
    await loader.onLTAllocatedByOwnerEvent(session, [], BLOCK_NUMBER, "LTAllocatedByOwner");
  });

  test("LTReceived", async () => {
    // initialization
    const provider = new ethers.providers.JsonRpcProvider();
    const directoryLoader = new Directory(undefined as unknown as EventListener, CHAIN_ID, provider, ADDRESS);
    const loader = new ChargedToken(CHAIN_ID, provider, ADDRESS, directoryLoader);
    const session = new ClientSession();

    // does nothing
    await loader.onLTReceivedEvent(session, [], BLOCK_NUMBER, "LTReceived");
  });

  test("LTDeposited", async () => {
    // initialization
    const provider = new ethers.providers.JsonRpcProvider();
    const directoryLoader = new Directory(undefined as unknown as EventListener, CHAIN_ID, provider, ADDRESS);
    const loader = new ChargedToken(CHAIN_ID, provider, ADDRESS, directoryLoader);
    const session = new ClientSession();

    // does nothing
    await loader.onLTDepositedEvent(session, [], BLOCK_NUMBER, "LTDeposited");
  });
});
