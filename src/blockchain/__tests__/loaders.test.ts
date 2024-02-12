import { BigNumber, ethers } from "ethers";
import { EMPTY_ADDRESS } from "../../vendor";
import { loadContract } from "../loaders";

describe("Contracts loaders", () => {
  const CHAIN_ID = 1337;
  const ADDRESS = "0x0";
  const BLOCK_NUMBER = 8888;

  let instance: jest.Mocked<ethers.Contract>;

  beforeEach(() => {
    instance = new ethers.Contract(ADDRESS, []) as jest.Mocked<ethers.Contract>;
  });

  it("should load directory data from blockchain", async () => {
    instance.owner.mockResolvedValueOnce("0xDIROWNER");
    instance.countWhitelistedProjectOwners.mockResolvedValueOnce(BigNumber.from(2));

    instance.getWhitelistedProjectOwner.mockResolvedValueOnce("0xOWNER1").mockResolvedValueOnce("0xOWNER2");
    instance.getWhitelistedProjectName.mockResolvedValueOnce("Project 2").mockResolvedValueOnce("Project 1");
    instance.whitelist.mockResolvedValueOnce("Project 1").mockResolvedValueOnce("Project 2");

    instance.countLTContracts.mockResolvedValueOnce(BigNumber.from(2));
    instance.getLTContract.mockResolvedValueOnce("0xCT2").mockResolvedValueOnce("0xCT1");
    instance.projectRelatedToLT.mockResolvedValueOnce("Project 2").mockResolvedValueOnce("Project 1");
    instance.areUserFunctionsDisabled.mockResolvedValueOnce(true);

    const result = await loadContract(CHAIN_ID, "Directory", instance, ADDRESS, BLOCK_NUMBER);

    expect(instance.countWhitelistedProjectOwners).toBeCalled();
    expect(instance.countLTContracts).toBeCalled();

    expect(result).toStrictEqual({
      chainId: CHAIN_ID,
      lastUpdateBlock: BLOCK_NUMBER,
      address: ADDRESS,
      owner: "0xDIROWNER",
      directory: ["0xCT2", "0xCT1"],
      whitelistedProjectOwners: ["0xOWNER1", "0xOWNER2"],
      projects: ["Project 2", "Project 1"],
      projectRelatedToLT: {
        "0xCT2": "Project 2",
        "0xCT1": "Project 1",
      },
      whitelist: {
        "0xOWNER1": "Project 1",
        "0xOWNER2": "Project 2",
      },
      areUserFunctionsDisabled: true,
    });
  });

  function mockChargedTokenContract() {
    instance.owner.mockResolvedValueOnce("0xOWNER");
    instance.name.mockResolvedValueOnce("NAME");
    instance.symbol.mockResolvedValueOnce("SYM");
    instance.decimals.mockResolvedValueOnce(18);
    instance.totalSupply.mockResolvedValueOnce(BigNumber.from(100));
    instance.fractionInitialUnlockPerThousand.mockResolvedValueOnce("1");
    instance.durationCliff.mockResolvedValueOnce("2");
    instance.durationLinearVesting.mockResolvedValueOnce("3");
    instance.maxInitialTokenAllocation.mockResolvedValueOnce("4");
    instance.maxWithdrawFeesPerThousandForLT.mockResolvedValueOnce("5");
    instance.maxClaimFeesPerThousandForPT.mockResolvedValueOnce("6");
    instance.maxStakingAPR.mockResolvedValueOnce("7");
    instance.maxStakingTokenAmount.mockResolvedValueOnce("8");
    instance.areUserFunctionsDisabled.mockResolvedValueOnce(false);
    instance.isInterfaceProjectTokenLocked.mockResolvedValueOnce(true);
    instance.areAllocationsTerminated.mockResolvedValueOnce(false);
    instance.interfaceProjectToken.mockResolvedValueOnce("0xINTERFACE");
    instance.ratioFeesToRewardHodlersPerThousand.mockResolvedValueOnce("9");
    instance.currentRewardPerShare1e18.mockResolvedValueOnce("10");
    instance.stakedLT.mockResolvedValueOnce("11");
    instance.balanceOf.mockResolvedValueOnce("12");
    instance.totalTokenAllocated.mockResolvedValueOnce("13");
    instance.withdrawFeesPerThousandForLT.mockResolvedValueOnce("14");
    instance.stakingStartDate.mockResolvedValueOnce("15");
    instance.stakingDuration.mockResolvedValueOnce("16");
    instance.stakingDateLastCheckpoint.mockResolvedValueOnce("17");
    instance.campaignStakingRewards.mockResolvedValueOnce("18");
    instance.totalStakingRewards.mockResolvedValueOnce("19");
  }

  function expectedChargedTokenData(): IChargedToken {
    return {
      // contract
      chainId: CHAIN_ID,
      lastUpdateBlock: BLOCK_NUMBER,
      address: ADDRESS,
      // ownable
      owner: "0xOWNER",
      // erc20
      name: "NAME",
      symbol: "SYM",
      decimals: "18",
      totalSupply: "100",
      // constants
      fractionInitialUnlockPerThousand: "1",
      durationCliff: "2",
      durationLinearVesting: "3",
      maxInitialTokenAllocation: "4",
      maxWithdrawFeesPerThousandForLT: "5",
      maxClaimFeesPerThousandForPT: "6",
      maxStakingAPR: "7",
      maxStakingTokenAmount: "8",
      // toggles
      areUserFunctionsDisabled: false,
      isInterfaceProjectTokenLocked: true,
      areAllocationsTerminated: false,
      // variables
      interfaceProjectToken: "0xINTERFACE",
      ratioFeesToRewardHodlersPerThousand: "9",
      currentRewardPerShare1e18: "10",
      stakedLT: "11",
      totalLocked: "12",
      totalTokenAllocated: "13",
      withdrawFeesPerThousandForLT: "14",
      // staking
      stakingStartDate: "15",
      stakingDuration: "16",
      stakingDateLastCheckpoint: "17",
      campaignStakingRewards: "18",
      totalStakingRewards: "19",
      isFundraisingContract: false,
      fundraisingTokenSymbol: "",
      priceTokenPer1e18: "0",
      fundraisingToken: EMPTY_ADDRESS,
      isFundraisingActive: false,
    };
  }

  function expectedFundraisingData(): IChargedTokenFundraising {
    return {
      fundraisingTokenSymbol: "0xFSYM",
      priceTokenPer1e18: "1234",
      fundraisingToken: "0xFTOKEN",
      isFundraisingActive: true,
    };
  }

  it("should load legacy charged token data from the blockchain", async () => {
    mockChargedTokenContract();

    instance.isFundraisingActive.mockImplementationOnce(() => {
      throw new Error("not a fundraising contract");
    });

    const result = await loadContract(CHAIN_ID, "ChargedToken", instance, ADDRESS, BLOCK_NUMBER);

    expect(instance.isFundraisingActive).toBeCalled();
    expect(instance.fundraisingTokenSymbol).not.toBeCalled();
    expect(instance.priceTokenPer1e18).not.toBeCalled();
    expect(instance.fundraisingToken).not.toBeCalled();
    expect(instance.areUserFunctionsDisabled).toBeCalled();
    expect(instance.isInterfaceProjectTokenLocked).toBeCalled();
    expect(instance.areAllocationsTerminated).toBeCalled();
    expect(instance.areUserFunctionsDisabled).toBeCalled();

    expect(result).toStrictEqual(expectedChargedTokenData());
  });

  it("should load fundraising charged token data from the blockchain", async () => {
    mockChargedTokenContract();

    instance.isFundraisingActive.mockResolvedValueOnce(true);
    instance.fundraisingTokenSymbol.mockResolvedValueOnce("0xFSYM");
    instance.priceTokenPer1e18.mockResolvedValueOnce(1234);
    instance.fundraisingToken.mockResolvedValueOnce("0xFTOKEN");

    const result = await loadContract(CHAIN_ID, "ChargedToken", instance, ADDRESS, BLOCK_NUMBER);

    expect(result).toStrictEqual({
      ...expectedChargedTokenData(),
      isFundraisingContract: true,
      ...expectedFundraisingData(),
    });
  });

  it("should load interface data from the blockchain", async () => {
    instance.owner.mockResolvedValueOnce("0xOWNER");
    instance.liquidityToken.mockResolvedValueOnce("0xCT");
    instance.projectToken.mockResolvedValueOnce("0xPT");
    instance.dateLaunch.mockResolvedValueOnce(BigNumber.from(10));
    instance.dateEndCliff.mockResolvedValueOnce(20);
    instance.claimFeesPerThousandForPT.mockResolvedValueOnce("30");

    const result = await loadContract(CHAIN_ID, "InterfaceProjectToken", instance, ADDRESS, BLOCK_NUMBER);

    expect(result).toStrictEqual({
      chainId: CHAIN_ID,
      lastUpdateBlock: BLOCK_NUMBER,
      address: ADDRESS,
      owner: "0xOWNER",
      liquidityToken: "0xCT",
      projectToken: "0xPT",
      dateLaunch: "10",
      dateEndCliff: "20",
      claimFeesPerThousandForPT: "30",
    });
  });

  it("should load delegable data from the blockchain", async () => {
    instance.countValidatedInterfaceProjectToken.mockResolvedValueOnce(BigNumber.from(2));
    instance.getValidatedInterfaceProjectToken.mockResolvedValueOnce("0xIT1").mockResolvedValueOnce("0xIT2");
    instance.owner.mockResolvedValueOnce("0xOWNER");
    instance.name.mockResolvedValueOnce("NAME");
    instance.symbol.mockResolvedValueOnce("SYM");
    instance.decimals.mockResolvedValueOnce(6);
    instance.totalSupply.mockResolvedValueOnce(BigNumber.from(100));
    instance.isListOfInterfaceProjectTokenComplete.mockResolvedValueOnce(true);

    const result = await loadContract(CHAIN_ID, "DelegableToLT", instance, ADDRESS, BLOCK_NUMBER);

    expect(result).toStrictEqual({
      chainId: CHAIN_ID,
      lastUpdateBlock: BLOCK_NUMBER,
      address: ADDRESS,
      owner: "0xOWNER",
      name: "NAME",
      symbol: "SYM",
      decimals: "6",
      totalSupply: "100",
      validatedInterfaceProjectToken: ["0xIT1", "0xIT2"],
      isListOfInterfaceProjectTokenComplete: true,
    });
  });

  it("should throw for invalid datatype", async () => {
    expect(() => loadContract(CHAIN_ID, "UserBalance", instance, ADDRESS, BLOCK_NUMBER)).rejects.toThrow();
  });
});
