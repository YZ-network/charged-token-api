import { ethers } from "ethers";
import { ClientSession } from "mongodb";
import { pubSub } from "../../graphql";
import { ChargedTokenModel, DirectoryModel, UserBalanceModel } from "../../models";
import { ChargedToken } from "../ChargedToken";
import { Directory } from "../Directory";
import { EventListener } from "../EventListener";

jest.mock("../../topics");
jest.mock("../../graphql");
jest.mock("../../models");
jest.mock("../EventListener");

describe("AbstractLoader: common loaders features", () => {
  const CHAIN_ID = 1337;
  const ADDRESS = "0xADDRESS";

  it("should call model toModel method, depending on the contract implementation", () => {
    const provider = new ethers.providers.JsonRpcProvider();
    const eventsListener = new EventListener();
    const directoryLoader = new Directory(eventsListener, CHAIN_ID, provider, ADDRESS);
    const ctLoader = new ChargedToken(CHAIN_ID, provider, ADDRESS, directoryLoader);

    expect(DirectoryModel.toModel).not.toBeCalled();
    expect(ChargedTokenModel.toModel).not.toBeCalled();

    (DirectoryModel as any).toModel.mockClear();
    (ChargedTokenModel as any).toModel.mockClear();
    directoryLoader.toModel({} as any);

    expect(DirectoryModel.toModel).toBeCalled();
    expect(ChargedTokenModel.toModel).not.toBeCalled();

    (DirectoryModel as any).toModel.mockClear();
    (ChargedTokenModel as any).toModel.mockClear();
    ctLoader.toModel({} as any);

    expect(DirectoryModel.toModel).not.toBeCalled();
    expect(ChargedTokenModel.toModel).toBeCalled();
  });

  it("should load balances by project token address", async () => {
    const provider = new ethers.providers.JsonRpcProvider();
    const eventsListener = new EventListener();
    const loader = new Directory(eventsListener, CHAIN_ID, provider, ADDRESS);
    const session = new ClientSession();

    await loader.getBalancesByProjectToken(session, "0xPT", "0xUSER");

    expect(UserBalanceModel.find).toBeCalledWith({ ptAddress: "0xPT", user: "0xUSER" }, undefined, { session });
  });

  it("should detect balances updates that trigger negative amounts", async () => {
    const provider = new ethers.providers.JsonRpcProvider();
    const eventsListener = new EventListener();
    const loader = new Directory(eventsListener, CHAIN_ID, provider, ADDRESS);
    const session = new ClientSession();

    const ERROR_MSG = "Invalid update detected : negative amounts in user balance";

    const blockNumber = 15;

    await expect(
      loader.updateBalanceAndNotify(
        session,
        ADDRESS,
        "0xUSER",
        { balance: "-0" },
        blockNumber,
        undefined,
        "SampleEvent",
      ),
    ).rejects.toThrow(ERROR_MSG);

    await expect(
      loader.updateBalanceAndNotify(
        session,
        ADDRESS,
        "0xUSER",
        { balancePT: "-0" },
        blockNumber,
        undefined,
        "SampleEvent",
      ),
    ).rejects.toThrow(ERROR_MSG);

    await expect(
      loader.updateBalanceAndNotify(
        session,
        ADDRESS,
        "0xUSER",
        { fullyChargedBalance: "-0" },
        blockNumber,
        undefined,
        "SampleEvent",
      ),
    ).rejects.toThrow(ERROR_MSG);

    await expect(
      loader.updateBalanceAndNotify(
        session,
        ADDRESS,
        "0xUSER",
        { partiallyChargedBalance: "-0" },
        blockNumber,
        undefined,
        "SampleEvent",
      ),
    ).rejects.toThrow(ERROR_MSG);

    await expect(
      loader.updateBalanceAndNotify(
        session,
        ADDRESS,
        "0xUSER",
        { claimedRewardPerShare1e18: "-0" },
        blockNumber,
        undefined,
        "SampleEvent",
      ),
    ).rejects.toThrow(ERROR_MSG);

    await expect(
      loader.updateBalanceAndNotify(
        session,
        ADDRESS,
        "0xUSER",
        { valueProjectTokenToFullRecharge: "-0" },
        blockNumber,
        undefined,
        "SampleEvent",
      ),
    ).rejects.toThrow(ERROR_MSG);
  });

  it("should update user balances and notify", async () => {
    const provider = new ethers.providers.JsonRpcProvider();
    const eventsListener = new EventListener();
    const loader = new Directory(eventsListener, CHAIN_ID, provider, ADDRESS);
    const session = new ClientSession();

    const blockNumber = 20;

    const jsonBalance = { balance: "15" } as any;
    const balanceUpdate = { ...jsonBalance, toJSON: jest.fn(() => jsonBalance) } as any;

    const getBalance = jest.spyOn(loader, "getBalance").mockImplementation(async () => balanceUpdate);
    (UserBalanceModel as any).toGraphQL.mockImplementation(() => jsonBalance);

    await loader.updateBalanceAndNotify(
      session,
      ADDRESS,
      "0xUSER",
      balanceUpdate,
      blockNumber,
      undefined,
      "SampleEvent",
    );

    expect(UserBalanceModel.updateOne).toBeCalledWith(
      { address: ADDRESS, user: "0xUSER" },
      { ...balanceUpdate, lastUpdateBlock: blockNumber },
      { session },
    );
    expect(getBalance).toBeCalledWith(session, ADDRESS, "0xUSER");
    expect(UserBalanceModel.toGraphQL).toBeCalledWith(balanceUpdate);
    expect(pubSub.publish).toBeCalledWith("UserBalance.1337.0xUSER", JSON.stringify([jsonBalance]));
  });

  it("should propagate changes to the PT balance and notify", async () => {
    const provider = new ethers.providers.JsonRpcProvider();
    const eventsListener = new EventListener();
    const loader = new Directory(eventsListener, CHAIN_ID, provider, ADDRESS);
    const session = new ClientSession();

    const blockNumber = 20;

    const jsonBalance = { balancePT: "15" } as any;
    const balanceUpdate = { ...jsonBalance, toJSON: jest.fn(() => jsonBalance) } as any;

    const getBalancesByPT = jest
      .spyOn(loader, "getBalancesByProjectToken")
      .mockImplementation(async () => [balanceUpdate]);
    (UserBalanceModel as any).toGraphQL.mockImplementation(() => jsonBalance);

    await loader.updateBalanceAndNotify(session, ADDRESS, "0xUSER", balanceUpdate, blockNumber, "0xPT", "SampleEvent");

    expect(UserBalanceModel.updateOne).toBeCalledWith(
      { address: ADDRESS, user: "0xUSER" },
      { ...balanceUpdate, lastUpdateBlock: blockNumber },
      { session },
    );
    expect(UserBalanceModel.updateMany).toBeCalledWith(
      { user: "0xUSER", ptAddress: "0xPT", address: { $ne: ADDRESS } },
      { ...jsonBalance, lastUpdateBlock: blockNumber },
      { session },
    );
    expect(getBalancesByPT).toBeCalledWith(session, "0xPT", "0xUSER");
    expect(UserBalanceModel.toGraphQL).toBeCalledWith(balanceUpdate);
    expect(pubSub.publish).toBeCalledWith("UserBalance.1337.0xUSER", JSON.stringify([jsonBalance]));
  });
});
