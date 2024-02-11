import { ClientSession } from "mongodb";
import { EMPTY_ADDRESS } from "../../../vendor";
import { AbstractBlockchainRepository } from "../../AbstractBlockchainRepository";
import { MockBlockchainRepository } from "../../__mocks__/MockBlockchainRepository";
import { DelegableToLT } from "../DelegableToLT";

describe("DelegableToLT loader", () => {
  const CHAIN_ID = 1337;
  const OWNER = "0x493942A95Bc6Db03CE8Cc22ff5a0441Dcc581f45";
  const ADDRESS = "0xF79A6c67E99b2135E09C3Ba0d06AE60977C1f393";
  const NAME = "Test CT";
  const SYMBOL = "TCT";

  let blockchain: jest.Mocked<AbstractBlockchainRepository>;
  let loaderFactory: jest.Mock;
  let loader: DelegableToLT;
  let session: ClientSession;

  beforeEach(() => {
    blockchain = new MockBlockchainRepository() as jest.Mocked<AbstractBlockchainRepository>;
    loaderFactory = jest.fn();
    loader = new DelegableToLT(CHAIN_ID, blockchain, ADDRESS, loaderFactory);
    session = new ClientSession();
  });

  // Event Handlers
  test("AddedInterfaceProjectToken", async () => {
    const blockNumber = 15;

    const loadedModel = {
      validatedInterfaceProjectToken: ["0xIF1", "0xIF2"],
    } as IDelegableToLT;
    blockchain.getLastState.mockResolvedValueOnce(loadedModel);

    const applyUpdateAndNotify = jest.spyOn(loader, "applyUpdateAndNotify");

    await loader.onAddedInterfaceProjectTokenEvent(
      session,
      ["0xNEW_INTERFACE"],
      blockNumber,
      "AddedInterfaceProjectToken",
    );

    expect(blockchain.getLastState).toBeCalled();
    expect(applyUpdateAndNotify).toHaveBeenCalledWith(
      {
        validatedInterfaceProjectToken: ["0xIF1", "0xIF2", "0xNEW_INTERFACE"],
      },
      blockNumber,
      "AddedInterfaceProjectToken",
      session,
    );
  });

  test("ListOfValidatedInterfaceProjectTokenIsFinalized", async () => {
    const blockNumber = 15;

    const applyUpdateAndNotify = jest.spyOn(loader, "applyUpdateAndNotify");

    await loader.onListOfValidatedInterfaceProjectTokenIsFinalizedEvent(
      session,
      [],
      blockNumber,
      "ListOfValidatedInterfaceProjectTokenIsFinalized",
    );

    expect(applyUpdateAndNotify).toHaveBeenCalledWith(
      {
        isListOfInterfaceProjectTokenComplete: true,
      },
      blockNumber,
      "ListOfValidatedInterfaceProjectTokenIsFinalized",
      session,
    );
  });

  test("InterfaceProjectTokenRemoved", async () => {
    const blockNumber = 15;

    const loadedModel = {
      validatedInterfaceProjectToken: ["0xIF1", "0xIF2REMOVE", "0xIF3"],
    } as IDelegableToLT;
    blockchain.getLastState.mockResolvedValueOnce(loadedModel);

    const applyUpdateAndNotify = jest.spyOn(loader, "applyUpdateAndNotify");

    await loader.onInterfaceProjectTokenRemovedEvent(
      session,
      ["0xIF2REMOVE"],
      blockNumber,
      "InterfaceProjectTokenRemoved",
    );

    expect(blockchain.getLastState).toBeCalled();
    expect(applyUpdateAndNotify).toHaveBeenCalledWith(
      {
        validatedInterfaceProjectToken: ["0xIF1", "0xIF3"],
      },
      blockNumber,
      "InterfaceProjectTokenRemoved",
      session,
    );
  });

  // Transfer use cases
  test("Transfer: empty value should do nothing", async () => {
    await loader.onTransferEvent(session, ["0xFROM", "0xTO", "0"], 15, "Transfer");
  });

  test("Transfer: p2p transfers should update both balances", async () => {
    const blockNumber = 15;

    const getPTBalance = jest.spyOn(loader, "getPTBalance").mockResolvedValueOnce("150").mockResolvedValueOnce("60");

    await loader.onTransferEvent(session, ["0xFROM", "0xTO", "10"], blockNumber, "Transfer");

    expect(getPTBalance).toHaveBeenNthCalledWith(1, "0xFROM", session);
    expect(blockchain.updatePTBalanceAndNotify).toHaveBeenNthCalledWith(
      1,
      ADDRESS,
      "0xFROM",
      { balancePT: "140" },
      blockNumber,
      "Transfer",
      session,
    );
    expect(getPTBalance).toHaveBeenNthCalledWith(2, "0xTO", session);
    expect(blockchain.updatePTBalanceAndNotify).toHaveBeenNthCalledWith(
      2,
      ADDRESS,
      "0xTO",
      { balancePT: "70" },
      blockNumber,
      "Transfer",
      session,
    );
  });

  test("Transfer: mint should increase user balance and totalSupply", async () => {
    const blockNumber = 15;

    const getPTBalance = jest.spyOn(loader, "getPTBalance").mockResolvedValueOnce("60");
    const updateContract = jest.spyOn(loader, "applyUpdateAndNotify");

    const contract = { totalSupply: "1000" } as any;
    blockchain.getLastState.mockResolvedValueOnce(contract);

    await loader.onTransferEvent(session, [EMPTY_ADDRESS, "0xTO", "10"], blockNumber, "Transfer");

    expect(getPTBalance).toHaveBeenNthCalledWith(1, "0xTO", session);
    expect(blockchain.updatePTBalanceAndNotify).toHaveBeenNthCalledWith(
      1,
      ADDRESS,
      "0xTO",
      { balancePT: "70" },
      blockNumber,
      "Transfer",
      session,
    );
    expect(blockchain.getLastState).toHaveBeenCalledWith("DelegableToLT", ADDRESS, session);
    expect(updateContract).toHaveBeenCalledWith({ totalSupply: "1010" }, blockNumber, "Transfer", session);
  });

  test("Transfer: burn should decrease user balance and totalSupply", async () => {
    const blockNumber = 15;

    const getPTBalance = jest.spyOn(loader, "getPTBalance").mockResolvedValueOnce("60");
    const updateContract = jest.spyOn(loader, "applyUpdateAndNotify");

    const contract = { totalSupply: "1000" } as any;
    blockchain.getLastState.mockResolvedValueOnce(contract);

    await loader.onTransferEvent(session, ["0xFROM", EMPTY_ADDRESS, "10"], blockNumber, "Transfer");

    expect(getPTBalance).toHaveBeenNthCalledWith(1, "0xFROM", session);
    expect(blockchain.updatePTBalanceAndNotify).toHaveBeenNthCalledWith(
      1,
      ADDRESS,
      "0xFROM",
      { balancePT: "50" },
      blockNumber,
      "Transfer",
      session,
    );
    expect(blockchain.getLastState).toHaveBeenCalledWith("DelegableToLT", ADDRESS, session);
    expect(updateContract).toHaveBeenCalledWith({ totalSupply: "990" }, blockNumber, "Transfer", session);
  });

  // extraneous events

  test("Approval", async () => {
    // does nothing
    await loader.onApprovalEvent(session, [], 15, "Approval");
  });

  test("AddedAllTimeValidatedInterfaceProjectToken", async () => {
    // does nothing
    await loader.onAddedAllTimeValidatedInterfaceProjectTokenEvent(
      session,
      [],
      15,
      "AddedAllTimeValidatedInterfaceProjectToken",
    );
  });
});
