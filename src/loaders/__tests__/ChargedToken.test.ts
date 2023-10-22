import { BigNumber, ethers } from "ethers";
import { ClientSession } from "mongodb";
import { pubSub } from "../../graphql";
import { type IChargedToken, type IUserBalance } from "../../models";
import { EMPTY_ADDRESS } from "../../types";
import { ChargedToken } from "../ChargedToken";
import { Directory } from "../Directory";
import { type EventListener } from "../EventListener";
import { InterfaceProjectToken } from "../InterfaceProjectToken";

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
    };
  }

  function prepareContractMock(loader: ChargedToken) {
    loader.instance.owner.mockImplementationOnce(async () => OWNER);
    loader.instance.name.mockImplementationOnce(async () => NAME);
    loader.instance.symbol.mockImplementationOnce(async () => SYMBOL);
    loader.instance.decimals.mockImplementationOnce(async () => BigNumber.from(18));
    loader.instance.totalSupply.mockImplementationOnce(async () => BigNumber.from(1));
    loader.instance.fractionInitialUnlockPerThousand.mockImplementationOnce(async () => BigNumber.from(2));
    loader.instance.durationCliff.mockImplementationOnce(async () => BigNumber.from(3));
    loader.instance.durationLinearVesting.mockImplementationOnce(async () => BigNumber.from(4));
    loader.instance.maxInitialTokenAllocation.mockImplementationOnce(async () => BigNumber.from(5));
    loader.instance.maxWithdrawFeesPerThousandForLT.mockImplementationOnce(async () => BigNumber.from(6));
    loader.instance.maxClaimFeesPerThousandForPT.mockImplementationOnce(async () => BigNumber.from(7));
    loader.instance.maxStakingAPR.mockImplementationOnce(async () => BigNumber.from(8));
    loader.instance.maxStakingTokenAmount.mockImplementationOnce(async () => BigNumber.from(9));
    loader.instance.areUserFunctionsDisabled.mockImplementationOnce(async () => true);
    loader.instance.isInterfaceProjectTokenLocked.mockImplementationOnce(async () => false);
    loader.instance.areAllocationsTerminated.mockImplementationOnce(async () => false);
    loader.instance.interfaceProjectToken.mockImplementationOnce(async () => INTERFACE_ADDR);
    loader.instance.ratioFeesToRewardHodlersPerThousand.mockImplementationOnce(async () => BigNumber.from(11));
    loader.instance.currentRewardPerShare1e18.mockImplementationOnce(async () => BigNumber.from(12));
    loader.instance.stakedLT.mockImplementationOnce(async () => BigNumber.from(13));
    loader.instance.balanceOf.mockImplementationOnce(async () => BigNumber.from(14));
    loader.instance.totalTokenAllocated.mockImplementationOnce(async () => BigNumber.from(15));
    loader.instance.withdrawFeesPerThousandForLT.mockImplementationOnce(async () => BigNumber.from(16));
    loader.instance.stakingStartDate.mockImplementationOnce(async () => BigNumber.from(17));
    loader.instance.stakingDuration.mockImplementationOnce(async () => BigNumber.from(18));
    loader.instance.stakingDateLastCheckpoint.mockImplementationOnce(async () => BigNumber.from(19));
    loader.instance.campaignStakingRewards.mockImplementationOnce(async () => BigNumber.from(20));
    loader.instance.totalStakingRewards.mockImplementationOnce(async () => BigNumber.from(21));
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
    expect(loader.actualBlock).toBe(0);
    expect(loader.lastUpdateBlock).toBe(0);
    expect(loader.lastState).toEqual(undefined);

    // mocking ethers
    const BLOCK_NUMBER = 15;

    (provider as any).getBlockNumber.mockImplementationOnce(() => BLOCK_NUMBER);

    // mocking mongo model
    const graphqlModel = sampleData();

    const modelInstanceMock = { save: jest.fn() };
    (loader.model as any).toModel.mockImplementationOnce(() => modelInstanceMock);
    (loader.model as any).exists.mockImplementationOnce(async () => null);
    (loader.model as any).toGraphQL.mockImplementationOnce(() => {
      return graphqlModel;
    });

    // mocking contract instance
    prepareContractMock(loader);

    // tested function
    await loader.init(session, undefined, true);

    // expectations
    expect(loader.initBlock).toBe(BLOCK_NUMBER);
    expect(loader.lastUpdateBlock).toBe(BLOCK_NUMBER);
    expect(loader.actualBlock).toBe(BLOCK_NUMBER);
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

    (provider as any).getBlockNumber.mockImplementationOnce(() => ACTUAL_BLOCK_NUMBER);

    // mocking mongo model
    const loadedModel = sampleData();

    const modelInstanceMock = { save: jest.fn() };
    (loader.model as any).toModel.mockImplementationOnce(() => modelInstanceMock);
    (loader.model as any).findOne.mockImplementationOnce(async () => loadedModel);
    (loader.model as any).toGraphQL.mockImplementationOnce(() => {
      return loadedModel;
    });

    // mocking contract instance
    (loader.instance as any).queryFilter.mockImplementationOnce(() => []);

    // tested function
    await loader.init(session, undefined, true);

    // expectations
    expect(loader.initBlock).toBe(BLOCK_NUMBER);
    expect(loader.lastUpdateBlock).toBe(BLOCK_NUMBER);
    expect(loader.actualBlock).toBe(ACTUAL_BLOCK_NUMBER);
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

    // mocking ethers
    (provider as any).getBlockNumber.mockImplementationOnce(() => BLOCK_NUMBER);

    // mocking contract instance
    (loader.instance as any).queryFilter.mockImplementationOnce(() => []);

    // mocking mongo model
    const loadedModel = {
      ...sampleData(),
      interfaceProjectToken: EMPTY_ADDRESS,
    };

    const modelInstanceMock = { save: jest.fn() };
    (loader.model as any).toModel.mockImplementationOnce(() => modelInstanceMock);
    (loader.model as any).findOne.mockImplementationOnce(async () => loadedModel);
    (loader.model as any).toGraphQL.mockImplementationOnce(() => {
      return loadedModel;
    });

    // tested function
    await loader.init(session, undefined, true);

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

    loader.actualBlock = ACTUAL_BLOCK_NUMBER;

    // mocking contract
    const expectedBalances = sampleBalance(user, ACTUAL_BLOCK_NUMBER);

    loader.instance.balanceOf.mockReset().mockImplementationOnce(() => BigNumber.from(expectedBalances.balance));
    loader.instance.getUserFullyChargedBalanceLiquiToken.mockImplementationOnce(() =>
      BigNumber.from(expectedBalances.fullyChargedBalance),
    );
    loader.instance.getUserPartiallyChargedBalanceLiquiToken.mockImplementationOnce(() =>
      BigNumber.from(expectedBalances.partiallyChargedBalance),
    );
    loader.instance.getUserDateOfPartiallyChargedToken.mockImplementationOnce(() =>
      BigNumber.from(expectedBalances.dateOfPartiallyCharged),
    );
    loader.instance.claimedRewardPerShare1e18.mockImplementationOnce(() =>
      BigNumber.from(expectedBalances.claimedRewardPerShare1e18),
    );

    const actualBalances = await loader.loadUserBalances(user);

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
    (provider as any).getBlockNumber.mockImplementationOnce(() => ACTUAL_BLOCK_NUMBER);

    // preparing loader initialization
    prepareContractMock(loader);

    const returnedData = { ...sampleData(), interfaceProjectToken: INTERFACE_ADDR };

    (loader.model as any).findOne.mockImplementationOnce(() => returnedData);
    (loader.model as any).toGraphQL.mockImplementationOnce(() => returnedData);

    (loader.instance as any).queryFilter.mockImplementationOnce(() => []);

    await loader.init(session);

    expect(loader.interface).toBeDefined();

    // mocking contract
    const expectedBalances = {
      ...sampleBalance(user, ACTUAL_BLOCK_NUMBER),
      valueProjectTokenToFullRecharge: "6",
      balancePT: "7",
    };

    loader.instance.balanceOf.mockReset().mockImplementationOnce(() => BigNumber.from(expectedBalances.balance));
    loader.instance.getUserFullyChargedBalanceLiquiToken.mockImplementationOnce(() =>
      BigNumber.from(expectedBalances.fullyChargedBalance),
    );
    loader.instance.getUserPartiallyChargedBalanceLiquiToken.mockImplementationOnce(() =>
      BigNumber.from(expectedBalances.partiallyChargedBalance),
    );
    loader.instance.getUserDateOfPartiallyChargedToken.mockImplementationOnce(() =>
      BigNumber.from(expectedBalances.dateOfPartiallyCharged),
    );
    loader.instance.claimedRewardPerShare1e18.mockImplementationOnce(() =>
      BigNumber.from(expectedBalances.claimedRewardPerShare1e18),
    );

    (loader.interface as any).loadUserBalancePT.mockImplementationOnce(() => expectedBalances.balancePT);
    (loader.interface as any).loadValueProjectTokenToFullRecharge.mockImplementationOnce(
      () => expectedBalances.valueProjectTokenToFullRecharge,
    );

    const actualBalances = await loader.loadUserBalances(user);

    expect(actualBalances).toEqual(expectedBalances);

    expect(loader.instance.balanceOf).toHaveBeenNthCalledWith(1, user);
    expect(loader.instance.getUserFullyChargedBalanceLiquiToken).toHaveBeenNthCalledWith(1, user);
    expect(loader.instance.getUserPartiallyChargedBalanceLiquiToken).toHaveBeenNthCalledWith(1, user);
    expect(loader.instance.getUserDateOfPartiallyChargedToken).toHaveBeenNthCalledWith(1, user);
    expect(loader.instance.claimedRewardPerShare1e18).toHaveBeenNthCalledWith(1, user);

    expect(loader.interface?.loadUserBalancePT).toHaveBeenNthCalledWith(1, user);
    expect(loader.interface?.loadValueProjectTokenToFullRecharge).toHaveBeenNthCalledWith(1, user);
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

    loader.actualBlock = BLOCK_NUMBER;

    const loadedModel = sampleData();

    (loader.model as any).exists.mockImplementationOnce(async () => "not_null");
    (loader.model as any).toGraphQL.mockImplementationOnce(() => loadedModel);

    await loader.onInterfaceProjectTokenIsLockedEvent(session, [], "InterfaceProjectTokenIsLocked");

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

    loader.actualBlock = BLOCK_NUMBER;

    const loadedModel = sampleData();

    const modelInstanceMock = { toJSON: jest.fn(() => loadedModel) };
    (loader.model as any).findOne.mockImplementationOnce(async () => modelInstanceMock);

    (loader.model as any).exists.mockImplementationOnce(async () => "not_null");
    (loader.model as any).toGraphQL.mockImplementationOnce(() => loadedModel);

    await loader.onIncreasedTotalTokenAllocatedEvent(session, ["10"], "IncreasedTotalTokenAllocated");

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
});
