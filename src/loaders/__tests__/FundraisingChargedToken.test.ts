import { BigNumber, ethers } from "ethers";
import { ClientSession } from "mongodb";
import { pubSub } from "../../graphql";
import { type IChargedToken } from "../../models";
import { DataType } from "../../types";
import { AbstractDbRepository } from "../AbstractDbRepository";
import { Directory } from "../Directory";
import { EventListener } from "../EventListener";
import { FundraisingChargedToken } from "../FundraisingChargedToken";
import { MockDbRepository } from "../__mocks__/MockDbRepository";

jest.mock("../../globals/config");
jest.mock("../EventListener");
jest.mock("../../topics");
jest.mock("../../graphql");
jest.mock("../../models");
jest.mock("../Directory");
jest.mock("../InterfaceProjectToken");

describe("FundraisingChargedToken loader", () => {
  const CHAIN_ID = 1337;
  const OWNER = "0x493942A95Bc6Db03CE8Cc22ff5a0441Dcc581f45";
  const ADDRESS = "0xF79A6c67E99b2135E09C3Ba0d06AE60977C1f393";
  const NAME = "Test CT";
  const SYMBOL = "TCT";
  const INTERFACE_ADDR = "0xIFACE";
  const BLOCK_NUMBER = 15;

  let provider: ethers.providers.JsonRpcProvider;
  let db: jest.Mocked<AbstractDbRepository>;
  let directoryLoader: Directory;
  let loader: FundraisingChargedToken;
  let session: ClientSession;

  beforeEach(() => {
    provider = new ethers.providers.JsonRpcProvider();
    db = new MockDbRepository();
    directoryLoader = new Directory(undefined as unknown as EventListener, CHAIN_ID, provider, ADDRESS, db);
    loader = new FundraisingChargedToken(CHAIN_ID, provider, ADDRESS, directoryLoader, db);
    session = new ClientSession();
  });

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
      isFundraisingContract: true,
      fundraisingToken: "0xfundraising",
      fundraisingTokenSymbol: "XXX",
      isFundraisingActive: true,
      priceTokenPer1e18: "22",
    };
  }

  function prepareContractMock(loader: FundraisingChargedToken) {
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
    loader.instance.fundraisingTokenSymbol.mockResolvedValueOnce("XXX");
    loader.instance.fundraisingToken.mockResolvedValueOnce("0xfundraising");
    loader.instance.isFundraisingActive.mockResolvedValueOnce(true);
    loader.instance.priceTokenPer1e18.mockResolvedValueOnce(BigNumber.from(22));
  }

  test("Should initialize FundraisingChargedToken by reading blockchain when not in db", async () => {
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

    db.get.mockResolvedValueOnce(null).mockResolvedValueOnce(graphqlModel);

    // mocking contract instance
    prepareContractMock(loader);

    // tested function
    await loader.init(session, BLOCK_NUMBER, true);

    // expectations
    expect(loader.initBlock).toBe(BLOCK_NUMBER);
    expect(loader.lastUpdateBlock).toBe(BLOCK_NUMBER);
    expect(loader.lastState).toEqual(graphqlModel);

    expect(db.get).toHaveBeenNthCalledWith(2, DataType.ChargedToken, CHAIN_ID, ADDRESS);
    expect(db.save).toHaveBeenCalledTimes(1);

    expect(loader.interface).toBeDefined();
    expect(loader.interface?.init).toBeCalledTimes(1);

    // checking only fields not loaded by herited ChargedToken
    expect(loader.instance.fundraisingTokenSymbol).toBeCalledTimes(1);
    expect(loader.instance.fundraisingToken).toBeCalledTimes(1);
    expect(loader.instance.priceTokenPer1e18).toBeCalledTimes(1);
    expect(loader.instance.isFundraisingActive).toBeCalledTimes(1);
    expect(loader.instance.queryFilter).toBeCalledTimes(0);

    expect(loader.lastState).toBeDefined();

    expect(loader.lastState?.isFundraisingActive).toBe(true);
    expect(loader.lastState?.fundraisingTokenSymbol).toBe("XXX");
    expect(loader.lastState?.fundraisingToken).toBe("0xfundraising");
    expect(loader.lastState?.isFundraisingContract).toBe(true);
    expect(loader.lastState?.priceTokenPer1e18).toEqual("22");

    expect((session as any).startTransaction).toBeCalledTimes(1);
    expect((session as any).commitTransaction).toBeCalledTimes(1);
  });

  // Event handlers
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
    (loader.instance as any).isFundraisingActive.mockResolvedValueOnce(true);

    await loader.onFundraisingStatusChangedEvent(session, [], BLOCK_NUMBER, "FundraisingStatusChanged");

    expect((loader.instance as any).isFundraisingActive).toBeCalledTimes(1);
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
