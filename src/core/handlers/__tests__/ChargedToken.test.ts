import { ClientSession } from "mongodb";
import { EMPTY_ADDRESS } from "../../../vendor";
import { AbstractBlockchainRepository } from "../../AbstractBlockchainRepository";
import { AbstractBroker } from "../../AbstractBroker";
import { MockBlockchainRepository } from "../../__mocks__/MockBlockchainRepository";
import { MockBroker } from "../../__mocks__/MockBroker";
import { ChargedToken } from "../ChargedToken";
import { DelegableToLT } from "../DelegableToLT";
import { InterfaceProjectToken } from "../InterfaceProjectToken";

jest.mock("../../../config");

describe("ChargedToken loader", () => {
  const CHAIN_ID = 1337;
  const OWNER = "0x493942A95Bc6Db03CE8Cc22ff5a0441Dcc581f45";
  const ADDRESS = "0xF79A6c67E99b2135E09C3Ba0d06AE60977C1f393";
  const NAME = "Test CT";
  const SYMBOL = "TCT";
  const INTERFACE_ADDR = "0xIFACE";
  const BLOCK_NUMBER = 15;

  let blockchain: jest.Mocked<AbstractBlockchainRepository>;
  let broker: jest.Mocked<AbstractBroker>;

  let loader: ChargedToken;
  let session: ClientSession;
  let loaderFactory: jest.Mock;

  beforeEach(() => {
    blockchain = new MockBlockchainRepository() as jest.Mocked<AbstractBlockchainRepository>;
    broker = new MockBroker() as jest.Mocked<AbstractBroker>;
    loaderFactory = jest.fn();
    loader = new ChargedToken(CHAIN_ID, blockchain, ADDRESS, loaderFactory);
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

  test("InterfaceProjectTokenIsLocked", async () => {
    await loader.onInterfaceProjectTokenIsLockedEvent(session, [], BLOCK_NUMBER, "InterfaceProjectTokenIsLocked");

    expect(blockchain.applyUpdateAndNotify).toHaveBeenCalledWith(
      "ChargedToken",
      ADDRESS,
      {
        isInterfaceProjectTokenLocked: true,
      },
      BLOCK_NUMBER,
      "InterfaceProjectTokenIsLocked",
      session,
    );
  });

  test("IncreasedTotalTokenAllocated", async () => {
    const loadedModel = sampleData();

    blockchain.getLastState.mockResolvedValue(loadedModel);

    await loader.onIncreasedTotalTokenAllocatedEvent(session, ["10"], BLOCK_NUMBER, "IncreasedTotalTokenAllocated");

    expect(blockchain.getLastState).toBeCalledTimes(1);
    expect(blockchain.applyUpdateAndNotify).toHaveBeenCalledWith(
      "ChargedToken",
      ADDRESS,
      { totalTokenAllocated: "25" },
      BLOCK_NUMBER,
      "IncreasedTotalTokenAllocated",
      session,
    );
  });

  test("UserFunctionsAreDisabled", async () => {
    const updateFunc = jest.spyOn(loader, "applyUpdateAndNotify").mockResolvedValue(undefined);

    await loader.onUserFunctionsAreDisabledEvent(session, [true], BLOCK_NUMBER, "UserFunctionsAreDisabled");

    expect(updateFunc).toBeCalledWith(
      { areUserFunctionsDisabled: true },
      BLOCK_NUMBER,
      "UserFunctionsAreDisabled",
      session,
    );
  });

  test("InterfaceProjectTokenSet should trigger interface and project token registrations", async () => {
    blockchain.getLastState.mockResolvedValueOnce({ projectToken: "0xPROJECT" });
    loaderFactory
      .mockReturnValueOnce(new InterfaceProjectToken(CHAIN_ID, blockchain, "0xINTERFACE", loaderFactory))
      .mockReturnValueOnce(new DelegableToLT(CHAIN_ID, blockchain, "0xPROJECT", loaderFactory));

    const updateFunc = jest.spyOn(loader, "applyUpdateAndNotify").mockResolvedValue(undefined);

    await loader.onInterfaceProjectTokenSetEvent(session, ["0xINTERFACE"], BLOCK_NUMBER, "InterfaceProjectTokenSet");

    expect(loaderFactory).toHaveBeenNthCalledWith(1, "InterfaceProjectToken", CHAIN_ID, "0xINTERFACE", blockchain);
    expect(blockchain.registerContract).toHaveBeenNthCalledWith(
      1,
      "InterfaceProjectToken",
      "0xINTERFACE",
      BLOCK_NUMBER,
      expect.any(InterfaceProjectToken),
      session,
    );

    expect(loaderFactory).toHaveBeenNthCalledWith(2, "DelegableToLT", CHAIN_ID, "0xPROJECT", blockchain);
    expect(blockchain.registerContract).toHaveBeenNthCalledWith(
      2,
      "DelegableToLT",
      "0xPROJECT",
      BLOCK_NUMBER,
      expect.any(DelegableToLT),
      session,
    );

    expect(updateFunc).toBeCalledWith(
      { interfaceProjectToken: "0xINTERFACE" },
      BLOCK_NUMBER,
      "InterfaceProjectTokenSet",
      session,
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

    expect(getBalance).toBeCalledWith("0xUSER", session);
    expect(updateFunc).toBeCalledWith(
      "0xUSER",
      { fullyChargedBalance: "150" },
      BLOCK_NUMBER,
      "IncreasedFullyChargedBalance",
      undefined,
      session,
    );
  });

  test("IncreasedFullyChargedBalance without existing balance", async () => {
    const getBalance = jest.spyOn(loader, "getBalance").mockResolvedValue(null);
    const updateFunc = jest.spyOn(loader, "updateBalanceAndNotify");

    await loader.onIncreasedFullyChargedBalanceEvent(
      session,
      ["0xUSER", "50"],
      BLOCK_NUMBER,
      "IncreasedFullyChargedBalance",
    );

    expect(getBalance).toBeCalledWith("0xUSER", session);
    expect(updateFunc).not.toBeCalled();
  });

  test("IncreasedStakedLT", async () => {
    const loadedCT = {
      stakedLT: "100",
    } as any;
    const getJsonModel = jest.spyOn(loader, "getLastState").mockResolvedValue(loadedCT);
    const updateFunc = jest.spyOn(loader, "applyUpdateAndNotify").mockResolvedValue(undefined);

    await loader.onIncreasedStakedLTEvent(session, ["50"], BLOCK_NUMBER, "IncreasedStakedLT");

    expect(getJsonModel).toBeCalledWith(session);
    expect(updateFunc).toBeCalledWith({ stakedLT: "150" }, BLOCK_NUMBER, "IncreasedStakedLT", session);
  });

  test("AllocationsAreTerminated", async () => {
    const updateFunc = jest.spyOn(loader, "applyUpdateAndNotify").mockResolvedValue(undefined);

    await loader.onAllocationsAreTerminatedEvent(session, [], BLOCK_NUMBER, "AllocationsAreTerminated");

    expect(updateFunc).toBeCalledWith(
      { areAllocationsTerminated: true },
      BLOCK_NUMBER,
      "AllocationsAreTerminated",
      session,
    );
  });

  test("DecreasedFullyChargedBalanceAndStakedLT without existing balance", async () => {
    const getBalance = jest.spyOn(loader, "getBalance").mockResolvedValue(null);
    const getJsonModel = jest.spyOn(loader, "getLastState").mockResolvedValue({ stakedLT: "100" } as IChargedToken);
    const updateContractFunc = jest.spyOn(loader, "applyUpdateAndNotify").mockResolvedValue(undefined);

    await loader.onDecreasedFullyChargedBalanceAndStakedLTEvent(
      session,
      ["0xUSER", "50"],
      BLOCK_NUMBER,
      "DecreasedFullyChargedBalanceAndStakedLT",
    );

    expect(getBalance).toBeCalledWith("0xUSER", session);
    expect(getJsonModel).toBeCalledWith(session);
    expect(updateContractFunc).toBeCalledWith(
      { stakedLT: "50" },
      BLOCK_NUMBER,
      "DecreasedFullyChargedBalanceAndStakedLT",
      session,
    );
  });

  test("DecreasedFullyChargedBalanceAndStakedLT with existing balance", async () => {
    const loadedBalance = {
      fullyChargedBalance: "100",
    } as any;
    const getBalance = jest.spyOn(loader, "getBalance").mockResolvedValue(loadedBalance);
    const getJsonModel = jest.spyOn(loader, "getLastState").mockResolvedValue({ stakedLT: "100" } as IChargedToken);
    const updateBalanceFunc = jest.spyOn(loader, "updateBalanceAndNotify").mockResolvedValue(undefined);
    const updateContractFunc = jest.spyOn(loader, "applyUpdateAndNotify").mockResolvedValue(undefined);

    await loader.onDecreasedFullyChargedBalanceAndStakedLTEvent(
      session,
      ["0xUSER", "50"],
      BLOCK_NUMBER,
      "DecreasedFullyChargedBalanceAndStakedLT",
    );

    expect(getBalance).toBeCalledWith("0xUSER", session);
    expect(updateBalanceFunc).toBeCalledWith(
      "0xUSER",
      { fullyChargedBalance: "50" },
      BLOCK_NUMBER,
      "DecreasedFullyChargedBalanceAndStakedLT",
      undefined,
      session,
    );

    expect(getJsonModel).toBeCalledWith(session);
    expect(updateContractFunc).toBeCalledWith(
      { stakedLT: "50" },
      BLOCK_NUMBER,
      "DecreasedFullyChargedBalanceAndStakedLT",
      session,
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

    expect(getBalance).toBeCalledWith("0xUSER", session);
    expect(updateBalanceFunc).toBeCalledWith(
      "0xUSER",
      { claimedRewardPerShare1e18: "50" },
      BLOCK_NUMBER,
      "ClaimedRewardPerShareUpdated",
      undefined,
      session,
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
      { currentRewardPerShare1e18: "50", stakingDateLastCheckpoint: "1234" },
      BLOCK_NUMBER,
      "CurrentRewardPerShareAndStakingCheckpointUpdated",
      session,
    );
  });

  test("IncreasedCurrentRewardPerShare", async () => {
    const getJsonModel = jest
      .spyOn(loader, "getLastState")
      .mockResolvedValue({ currentRewardPerShare1e18: "150" } as IChargedToken);
    const updateFunc = jest.spyOn(loader, "applyUpdateAndNotify").mockResolvedValue(undefined);

    await loader.onIncreasedCurrentRewardPerShareEvent(session, ["50"], BLOCK_NUMBER, "IncreasedCurrentRewardPerShare");

    expect(getJsonModel).toBeCalledWith(session);
    expect(updateFunc).toBeCalledWith(
      { currentRewardPerShare1e18: "200" },
      BLOCK_NUMBER,
      "IncreasedCurrentRewardPerShare",
      session,
    );
  });

  test("StakingCampaignCreated", async () => {
    const getJsonModel = jest
      .spyOn(loader, "getLastState")
      .mockResolvedValue({ totalStakingRewards: "100", totalTokenAllocated: "200" } as IChargedToken);
    const updateFunc = jest.spyOn(loader, "applyUpdateAndNotify").mockResolvedValue(undefined);

    await loader.onStakingCampaignCreatedEvent(session, ["10", "20", "30"], BLOCK_NUMBER, "StakingCampaignCreated");

    expect(getJsonModel).toBeCalledWith(session);
    expect(updateFunc).toBeCalledWith(
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
      session,
    );
  });

  test("WithdrawalFeesUpdated", async () => {
    const updateFunc = jest.spyOn(loader, "applyUpdateAndNotify").mockResolvedValue(undefined);

    await loader.onWithdrawalFeesUpdatedEvent(session, ["1234"], BLOCK_NUMBER, "WithdrawalFeesUpdated");

    expect(updateFunc).toBeCalledWith(
      {
        withdrawFeesPerThousandForLT: "1234",
      },
      BLOCK_NUMBER,
      "WithdrawalFeesUpdated",
      session,
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
      {
        ratioFeesToRewardHodlersPerThousand: "1234",
      },
      BLOCK_NUMBER,
      "RatioFeesToRewardHodlersUpdated",
      session,
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

    expect(getBalance).toBeCalledWith("0xUSER", session);
    expect(updateBalanceFunc).toBeCalledWith(
      "0xUSER",
      { partiallyChargedBalance: "50" },
      BLOCK_NUMBER,
      "DecreasedPartiallyChargedBalance",
      undefined,
      session,
    );
  });

  test("UpdatedDateOfPartiallyChargedAndDecreasedStakedLT", async () => {
    const loadedModel = { stakedLT: "150" } as any;
    const getJsonModel = jest.spyOn(loader, "getLastState").mockResolvedValue(loadedModel);
    const updateFunc = jest.spyOn(loader, "applyUpdateAndNotify").mockResolvedValue(undefined);

    await loader.onUpdatedDateOfPartiallyChargedAndDecreasedStakedLTEvent(
      session,
      ["1234", "50"],
      BLOCK_NUMBER,
      "UpdatedDateOfPartiallyChargedAndDecreasedStakedLT",
    );

    expect(getJsonModel).toBeCalledWith(session);
    expect(updateFunc).toBeCalledWith(
      {
        stakedLT: "100",
      },
      BLOCK_NUMBER,
      "UpdatedDateOfPartiallyChargedAndDecreasedStakedLT",
      session,
    );
  });

  test("TokensDischarged", async () => {
    const loadedBalance = {} as any;
    const getBalance = jest.spyOn(loader, "getBalance").mockResolvedValue(loadedBalance);
    const updateBalanceFunc = jest.spyOn(loader, "updateBalanceAndNotify").mockResolvedValue(undefined);

    await loader.onTokensDischargedEvent(session, ["0xUSER", "100"], BLOCK_NUMBER, "TokensDischarged");

    expect(getBalance).toBeCalledWith("0xUSER", session);
    expect(updateBalanceFunc).toBeCalledWith(
      "0xUSER",
      { fullyChargedBalance: "0", partiallyChargedBalance: "100" },
      BLOCK_NUMBER,
      "TokensDischarged",
      undefined,
      session,
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

    expect(getBalance).toHaveBeenNthCalledWith(1, "0xFROM", session);
    expect(updateBalance).toHaveBeenNthCalledWith(
      1,
      "0xFROM",
      { balance: "140" },
      BLOCK_NUMBER,
      "Transfer",
      undefined,
      session,
    );
    expect(getBalance).toHaveBeenNthCalledWith(2, "0xTO", session);
    expect(updateBalance).toHaveBeenNthCalledWith(
      2,
      "0xTO",
      { balance: "70" },
      BLOCK_NUMBER,
      "Transfer",
      undefined,
      session,
    );
  });

  test("Transfer: withdraw should increase user balance and decrease totalLocked", async () => {
    const userBalance = { balance: "60" } as any;
    const getBalance = jest.spyOn(loader, "getBalance").mockResolvedValueOnce(userBalance);
    const contract = { totalLocked: "1000" } as any;
    const getJsonModel = jest.spyOn(loader, "getLastState").mockResolvedValue(contract);
    const updateBalance = jest.spyOn(loader, "updateBalanceAndNotify").mockResolvedValue(undefined);
    const updateContract = jest.spyOn(loader, "applyUpdateAndNotify").mockResolvedValue(undefined);

    await loader.onTransferEvent(session, [ADDRESS, "0xTO", "10"], BLOCK_NUMBER, "Transfer");

    expect(getBalance).toHaveBeenNthCalledWith(1, "0xTO", session);
    expect(updateBalance).toHaveBeenNthCalledWith(
      1,
      "0xTO",
      { balance: "70" },
      BLOCK_NUMBER,
      "Transfer",
      undefined,
      session,
    );
    expect(getJsonModel).toHaveBeenCalledWith(session);
    expect(updateContract).toHaveBeenCalledWith({ totalLocked: "990" }, BLOCK_NUMBER, "Transfer", session);
  });

  test("Transfer: deposit should decrease user balance and increase totalLocked", async () => {
    const userBalance = { balance: "60" } as any;
    const getBalance = jest.spyOn(loader, "getBalance").mockResolvedValueOnce(userBalance);
    const contract = { totalLocked: "1000" } as any;
    const getJsonModel = jest.spyOn(loader, "getLastState").mockResolvedValue(contract);
    const updateBalance = jest.spyOn(loader, "updateBalanceAndNotify").mockResolvedValue(undefined);
    const updateContract = jest.spyOn(loader, "applyUpdateAndNotify").mockResolvedValue(undefined);

    await loader.onTransferEvent(session, ["0xFROM", ADDRESS, "10"], BLOCK_NUMBER, "Transfer");

    expect(getBalance).toHaveBeenNthCalledWith(1, "0xFROM", session);
    expect(updateBalance).toHaveBeenNthCalledWith(
      1,
      "0xFROM",
      { balance: "50" },
      BLOCK_NUMBER,
      "Transfer",
      undefined,
      session,
    );
    expect(getJsonModel).toHaveBeenCalledWith(session);
    expect(updateContract).toHaveBeenCalledWith({ totalLocked: "1010" }, BLOCK_NUMBER, "Transfer", session);
  });

  test("Transfer: mint should increase user balance and totalSupply", async () => {
    const userBalance = { balance: "60" } as any;
    const getBalance = jest.spyOn(loader, "getBalance").mockResolvedValueOnce(userBalance);
    const contract = { totalSupply: "1000" } as any;
    const getJsonModel = jest.spyOn(loader, "getLastState").mockResolvedValue(contract);
    const updateBalance = jest.spyOn(loader, "updateBalanceAndNotify").mockResolvedValue(undefined);
    const updateContract = jest.spyOn(loader, "applyUpdateAndNotify").mockResolvedValue(undefined);

    await loader.onTransferEvent(session, [EMPTY_ADDRESS, "0xTO", "10"], BLOCK_NUMBER, "Transfer");

    expect(getBalance).toHaveBeenNthCalledWith(1, "0xTO", session);
    expect(updateBalance).toHaveBeenNthCalledWith(
      1,
      "0xTO",
      { balance: "70" },
      BLOCK_NUMBER,
      "Transfer",
      undefined,
      session,
    );
    expect(getJsonModel).toHaveBeenCalledWith(session);
    expect(updateContract).toHaveBeenCalledWith({ totalSupply: "1010" }, BLOCK_NUMBER, "Transfer", session);
  });

  test("Transfer: burn should decrease user balance and totalSupply", async () => {
    const userBalance = { balance: "60" } as any;
    const getBalance = jest.spyOn(loader, "getBalance").mockResolvedValueOnce(userBalance);
    const contract = { totalSupply: "1000" } as any;
    const getJsonModel = jest.spyOn(loader, "getLastState").mockResolvedValue(contract);
    const updateBalance = jest.spyOn(loader, "updateBalanceAndNotify").mockResolvedValue(undefined);
    const updateContract = jest.spyOn(loader, "applyUpdateAndNotify").mockResolvedValue(undefined);

    await loader.onTransferEvent(session, ["0xFROM", EMPTY_ADDRESS, "10"], BLOCK_NUMBER, "Transfer");

    expect(getBalance).toHaveBeenNthCalledWith(1, "0xFROM", session);
    expect(updateBalance).toHaveBeenNthCalledWith(
      1,
      "0xFROM",
      { balance: "50" },
      BLOCK_NUMBER,
      "Transfer",
      undefined,
      session,
    );
    expect(getJsonModel).toHaveBeenCalledWith(session);
    expect(updateContract).toHaveBeenCalledWith({ totalSupply: "990" }, BLOCK_NUMBER, "Transfer", session);
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
    const updateFunc = jest.spyOn(loader, "applyUpdateAndNotify");

    await loader.onFundraisingConditionsSetEvent(
      session,
      ["0xfundlowering", "YYY", "55"],
      BLOCK_NUMBER,
      "FundraisingConditionsSet",
    );

    expect(updateFunc).toHaveBeenCalledWith(
      {
        fundraisingToken: "0xfundlowering",
        fundraisingTokenSymbol: "YYY",
        priceTokenPer1e18: "55",
      },
      BLOCK_NUMBER,
      "FundraisingConditionsSet",
      session,
    );
  });

  test("FundraisingStatusChanged", async () => {
    const updateFunc = jest.spyOn(loader, "applyUpdateAndNotify");

    blockchain.getChargedTokenFundraisingStatus.mockResolvedValueOnce(true);

    await loader.onFundraisingStatusChangedEvent(session, [], BLOCK_NUMBER, "FundraisingStatusChanged");

    expect(blockchain.getChargedTokenFundraisingStatus).toBeCalledTimes(1);
    expect(updateFunc).toHaveBeenCalledWith(
      {
        isFundraisingActive: true,
      },
      BLOCK_NUMBER,
      "FundraisingStatusChanged",
      session,
    );
  });

  // extraneous events

  test("LTAllocatedThroughSale", async () => {
    // does nothing
    await loader.onLTAllocatedThroughSaleEvent(session, [], BLOCK_NUMBER, "LTAllocatedThroughSale");
  });
});
