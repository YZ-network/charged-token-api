import { UserBalanceModel, type IUserBalance } from "../UserBalances";

jest.unmock("mongoose");
jest.unmock("mongodb");

describe("UserBalanceModel", () => {
  function sampleData(): IUserBalance {
    return {
      chainId: 1337,
      lastUpdateBlock: 20,
      user: "0xuser",
      address: "0xADDR",
      ptAddress: "0xPT_ADDR",
      balance: "1",
      balancePT: "2",
      fullyChargedBalance: "3",
      partiallyChargedBalance: "4",
      dateOfPartiallyCharged: "5",
      claimedRewardPerShare1e18: "6",
      valueProjectTokenToFullRecharge: "7",
    };
  }

  test("should convert business object to mongo model", () => {
    const bo: IUserBalance = sampleData();

    const model = UserBalanceModel.toModel(bo);

    expect(model.toJSON()).toMatchObject(bo);
  });

  test("should convert mongo model to business object in graphql format", () => {
    const sample = sampleData();
    const model = new UserBalanceModel(sample);

    const bo = UserBalanceModel.toGraphQL(model);

    expect(bo._id).toBeDefined();
    expect(bo).toMatchObject(sample);
  });
});
