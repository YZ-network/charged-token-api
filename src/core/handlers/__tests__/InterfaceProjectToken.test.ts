import { BigNumber } from "ethers";
import { ClientSession } from "mongodb";
import { AbstractBlockchainRepository } from "../../AbstractBlockchainRepository";
import { MockBlockchainRepository } from "../../__mocks__/MockBlockchainRepository";
import { InterfaceProjectToken } from "../InterfaceProjectToken";

describe("InterfaceProjectToken loader", () => {
  const CHAIN_ID = 1337;
  const OWNER = "0x493942A95Bc6Db03CE8Cc22ff5a0441Dcc581f45";
  const ADDRESS = "0xF79A6c67E99b2135E09C3Ba0d06AE60977C1f393";
  const BLOCK_NUMBER = 15;
  const PT_ADDRESS = "0xPT";

  let blockchain: jest.Mocked<AbstractBlockchainRepository>;
  let loader: InterfaceProjectToken;
  let loaderFactory: jest.Mock;
  let session: ClientSession;

  beforeEach(() => {
    blockchain = new MockBlockchainRepository() as jest.Mocked<AbstractBlockchainRepository>;
    loaderFactory = jest.fn();
    loader = new InterfaceProjectToken(CHAIN_ID, blockchain, ADDRESS, loaderFactory);
    session = new ClientSession();
  });

  function sampleData() {
    return {
      chainId: CHAIN_ID,
      initBlock: BLOCK_NUMBER,
      lastUpdateBlock: BLOCK_NUMBER,
      address: ADDRESS,
      owner: OWNER,
      liquidityToken: "0xLT",
      projectToken: PT_ADDRESS,
      dateLaunch: "1",
      dateEndCliff: "2",
      claimFeesPerThousandForPT: "3",
    };
  }

  // Event handlers
  test("StartSet", async () => {
    const updateFunc = jest.spyOn(loader, "applyUpdateAndNotify");

    const dateLaunch = BigNumber.from("10");
    const dateEndCliff = BigNumber.from("20");

    await loader.onStartSetEvent(session, [dateLaunch, dateEndCliff], BLOCK_NUMBER, "StartSet");

    expect(blockchain.getLastState).toBeCalledTimes(0);
    expect(updateFunc).toHaveBeenCalledWith(
      {
        dateLaunch: dateLaunch.toString(),
        dateEndCliff: dateEndCliff.toString(),
      },
      BLOCK_NUMBER,
      "StartSet",
      session,
    );
  });

  test("ProjectTokenReceived", async () => {
    // does nothing
    await loader.onProjectTokenReceivedEvent(session, [], BLOCK_NUMBER, "ProjectTokenReceived");
  });

  test("IncreasedValueProjectTokenToFullRecharge", async () => {
    const balance = {
      valueProjectTokenToFullRecharge: "100",
    } as IUserBalance;
    blockchain.getUserBalance.mockResolvedValueOnce(balance);
    blockchain.getLastState.mockResolvedValueOnce({ liquidityToken: "0xCT", projectToken: "0xPT" });
    blockchain.getUserLiquiToken.mockResolvedValueOnce({ dateOfPartiallyCharged: 150 });

    await loader.onIncreasedValueProjectTokenToFullRechargeEvent(
      session,
      ["0xUSER", "100"],
      BLOCK_NUMBER,
      "IncreasedValueProjectTokenToFullRecharge",
    );

    expect(blockchain.getUserBalance).toBeCalledTimes(1);
    expect(blockchain.getLastState).toBeCalledTimes(1);
    expect(blockchain.getUserLiquiToken).toBeCalledWith("0xCT", "0xUSER");
    expect(blockchain.updateBalanceAndNotify).toHaveBeenNthCalledWith(
      1,
      "0xCT",
      "0xUSER",
      {
        valueProjectTokenToFullRecharge: "200",
        dateOfPartiallyCharged: "150",
      },
      BLOCK_NUMBER,
      undefined,
      "IncreasedValueProjectTokenToFullRecharge",
      session,
    );
  });

  test("LTRecharged", async () => {
    const balance = {
      valueProjectTokenToFullRecharge: "150",
    } as any;

    blockchain.getLastState.mockResolvedValueOnce({ liquidityToken: "0xCT", projectToken: "0xPT" });
    blockchain.getUserBalance.mockResolvedValueOnce(balance);

    await loader.onLTRechargedEvent(session, ["0xUSER", "999", "50", "777"], BLOCK_NUMBER, "LTRecharged");

    expect(blockchain.getUserBalance).toBeCalledTimes(1);
    expect(blockchain.updateBalanceAndNotify).toHaveBeenNthCalledWith(
      1,
      "0xCT",
      "0xUSER",
      {
        valueProjectTokenToFullRecharge: "100",
      },
      BLOCK_NUMBER,
      undefined,
      "LTRecharged",
      session,
    );
  });

  test("ClaimFeesUpdated", async () => {
    const applyUpdateAndNotify = jest.spyOn(loader, "applyUpdateAndNotify");

    await loader.onClaimFeesUpdatedEvent(session, ["1234"], BLOCK_NUMBER, "ClaimFeesUpdated");

    expect(applyUpdateAndNotify).toHaveBeenNthCalledWith(
      1,
      {
        claimFeesPerThousandForPT: "1234",
      },
      BLOCK_NUMBER,
      "ClaimFeesUpdated",
      session,
    );
  });
});
