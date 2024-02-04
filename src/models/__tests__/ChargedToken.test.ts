import { EMPTY_ADDRESS } from "../../types";
import { ChargedTokenModel, type IChargedToken } from "../ChargedToken";

jest.unmock("mongoose");
jest.unmock("mongodb");

describe("ChargedTokenModel", () => {
  function sampleData(): IChargedToken {
    return {
      chainId: 1337,
      initBlock: 15,
      lastUpdateBlock: 20,
      address: "0xADDRESS",
      // ownable
      owner: "0xOWNER",
      // erc20
      name: "name",
      symbol: "symbol",
      decimals: "18",
      totalSupply: "1",
      // constants
      fractionInitialUnlockPerThousand: "2",
      durationCliff: "3",
      durationLinearVesting: "4",
      maxInitialTokenAllocation: "5",
      maxWithdrawFeesPerThousandForLT: "6",
      maxClaimFeesPerThousandForPT: "7",
      maxStakingAPR: "8",
      maxStakingTokenAmount: "9",
      // toggles
      areUserFunctionsDisabled: true,
      isInterfaceProjectTokenLocked: false,
      areAllocationsTerminated: false,
      // variables
      interfaceProjectToken: "0xIFACE",
      ratioFeesToRewardHodlersPerThousand: "10",
      currentRewardPerShare1e18: "11",
      stakedLT: "12",
      totalLocked: "13",
      totalTokenAllocated: "14",
      withdrawFeesPerThousandForLT: "15",
      // staking
      stakingStartDate: "16",
      stakingDuration: "17",
      stakingDateLastCheckpoint: "18",
      campaignStakingRewards: "19",
      totalStakingRewards: "20",
      //fundraising
      isFundraisingContract: false,
      fundraisingToken: EMPTY_ADDRESS,
      fundraisingTokenSymbol: "",
      isFundraisingActive: false,
      priceTokenPer1e18: "0",
    };
  }

  test("should convert mongo model to business object in graphql format", () => {
    const sample = sampleData();
    const model = new ChargedTokenModel(sample);

    const bo = ChargedTokenModel.toGraphQL(model);

    expect(bo._id).toBeDefined();
    expect(bo).toMatchObject(sample);
  });
});
