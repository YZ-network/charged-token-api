import { EMPTY_ADDRESS } from "../../vendor";
import { AbstractBlockchainRepository } from "../AbstractBlockchainRepository";
import { ContractsWatcher } from "../ContractsWatcher";
import { MockBlockchainRepository } from "../__mocks__/MockBlockchainRepository";
import { ChargedToken } from "../handlers/ChargedToken";
import { DelegableToLT } from "../handlers/DelegableToLT";
import { Directory } from "../handlers/Directory";
import { InterfaceProjectToken } from "../handlers/InterfaceProjectToken";

jest.mock("../../config");

describe("ContractsWatcher", () => {
  const CHAIN_ID = 1337;
  const ADDRESS = "0xADDRESS";

  let blockchain: jest.Mocked<AbstractBlockchainRepository>;
  let watcher: ContractsWatcher;

  beforeEach(() => {
    blockchain = new MockBlockchainRepository() as jest.Mocked<AbstractBlockchainRepository>;
    watcher = new ContractsWatcher(CHAIN_ID, blockchain);
  });

  // registrations

  test("should delegate directory loading to blockchain service", async () => {
    const registerChargedToken = jest.spyOn(watcher, "registerChargedToken");

    blockchain.getBlockNumber.mockResolvedValueOnce(15);
    blockchain.registerContract.mockResolvedValueOnce({ directory: [] as string[] } as IDirectory);

    await watcher.registerDirectory(ADDRESS);

    expect(blockchain.getBlockNumber).toBeCalled();
    expect(blockchain.registerContract).toBeCalledWith("Directory", ADDRESS, 15, expect.any(Directory));
    expect(registerChargedToken).not.toBeCalled();
  });

  test("should trigger charged token loading if directory has any", async () => {
    const registerChargedToken = jest.spyOn(watcher, "registerChargedToken");
    registerChargedToken.mockImplementation(async () => undefined);

    blockchain.getBlockNumber.mockResolvedValueOnce(15);
    blockchain.registerContract.mockResolvedValueOnce({ directory: ["0xCT1", "0xCT2"] as string[] } as IDirectory);

    await watcher.registerDirectory(ADDRESS);

    expect(blockchain.getBlockNumber).toBeCalled();
    expect(blockchain.registerContract).toBeCalledWith("Directory", ADDRESS, 15, expect.any(Directory));
    expect(registerChargedToken).toHaveBeenNthCalledWith(1, "0xCT1", 15);
    expect(registerChargedToken).toHaveBeenNthCalledWith(2, "0xCT2", 15);
  });

  test("should delegate charged token loading to blockchain service", async () => {
    const registerInterfaceProjectToken = jest.spyOn(watcher, "registerInterfaceProjectToken");

    blockchain.registerContract.mockResolvedValueOnce({ interfaceProjectToken: EMPTY_ADDRESS } as IChargedToken);

    await watcher.registerChargedToken(ADDRESS, 15);

    expect(blockchain.registerContract).toBeCalledWith("ChargedToken", ADDRESS, 15, expect.any(ChargedToken));
    expect(registerInterfaceProjectToken).not.toBeCalled();
  });

  test("should trigger interface loading if charged token has any", async () => {
    const registerInterfaceProjectToken = jest.spyOn(watcher, "registerInterfaceProjectToken");
    registerInterfaceProjectToken.mockImplementation(async () => undefined);

    blockchain.registerContract.mockResolvedValueOnce({ interfaceProjectToken: "0xINTERFACE" } as IChargedToken);

    await watcher.registerChargedToken(ADDRESS, 15);

    expect(blockchain.registerContract).toBeCalledWith("ChargedToken", ADDRESS, 15, expect.any(ChargedToken));
    expect(registerInterfaceProjectToken).toHaveBeenCalledWith("0xINTERFACE", 15);
  });

  test("should delegate interface loading to blockchain service", async () => {
    const registerDelegableToLT = jest.spyOn(watcher, "registerDelegableToLT");

    blockchain.registerContract.mockResolvedValueOnce({ projectToken: EMPTY_ADDRESS } as IInterfaceProjectToken);

    await watcher.registerInterfaceProjectToken(ADDRESS, 15);

    expect(blockchain.registerContract).toBeCalledWith(
      "InterfaceProjectToken",
      ADDRESS,
      15,
      expect.any(InterfaceProjectToken),
    );
    expect(registerDelegableToLT).not.toBeCalled();
  });

  test("should trigger project token loading if interface has any", async () => {
    const registerDelegableToLT = jest.spyOn(watcher, "registerDelegableToLT");
    registerDelegableToLT.mockImplementation(async () => undefined);

    blockchain.registerContract.mockResolvedValueOnce({ projectToken: "0xPT" } as IInterfaceProjectToken);
    blockchain.isContractRegistered.mockReturnValueOnce(false);

    await watcher.registerInterfaceProjectToken(ADDRESS, 15);

    expect(blockchain.isContractRegistered).toBeCalledWith("0xPT");
    expect(blockchain.registerContract).toBeCalledWith(
      "InterfaceProjectToken",
      ADDRESS,
      15,
      expect.any(InterfaceProjectToken),
    );
    expect(registerDelegableToLT).toHaveBeenCalledWith("0xPT", 15);
  });

  test("should skip project token loading if it is already registered", async () => {
    const registerDelegableToLT = jest.spyOn(watcher, "registerDelegableToLT");
    registerDelegableToLT.mockImplementation(async () => undefined);

    blockchain.registerContract.mockResolvedValueOnce({ projectToken: "0xPT" } as IInterfaceProjectToken);
    blockchain.isContractRegistered.mockReturnValueOnce(true);

    await watcher.registerInterfaceProjectToken(ADDRESS, 15);

    expect(blockchain.isContractRegistered).toBeCalledWith("0xPT");
    expect(blockchain.registerContract).toBeCalledWith(
      "InterfaceProjectToken",
      ADDRESS,
      15,
      expect.any(InterfaceProjectToken),
    );
    expect(registerDelegableToLT).not.toBeCalled();
  });

  test("should delegate interface loading to blockchain service", async () => {
    blockchain.registerContract.mockResolvedValueOnce({ address: ADDRESS } as IDelegableToLT);

    await watcher.registerDelegableToLT(ADDRESS, 15);

    expect(blockchain.registerContract).toBeCalledWith("DelegableToLT", ADDRESS, 15, expect.any(DelegableToLT));
  });

  // unregistrations

  test("should delegate directory removal to blockchain service", async () => {
    const unregisterChargedToken = jest.spyOn(watcher, "unregisterChargedToken");

    blockchain.getLastState.mockResolvedValueOnce({ directory: [] as string[] } as IDirectory);
    blockchain.unregisterContract.mockResolvedValueOnce(undefined);

    await watcher.unregisterDirectory(ADDRESS);

    expect(blockchain.getLastState).toBeCalledWith("Directory", ADDRESS);
    expect(blockchain.unregisterContract).toBeCalledWith("Directory", ADDRESS);
    expect(unregisterChargedToken).not.toBeCalled();
  });

  test("should trigger charged token removal if directory has any", async () => {
    const unregisterChargedToken = jest.spyOn(watcher, "unregisterChargedToken");
    unregisterChargedToken.mockImplementation(async () => undefined);

    blockchain.getLastState.mockResolvedValueOnce({ directory: ["0xCT1", "0xCT2"] as string[] } as IDirectory);
    blockchain.unregisterContract.mockResolvedValueOnce(undefined);

    await watcher.unregisterDirectory(ADDRESS);

    expect(blockchain.getLastState).toBeCalled();
    expect(blockchain.unregisterContract).toBeCalled();
    expect(unregisterChargedToken).toHaveBeenNthCalledWith(1, "0xCT1");
    expect(unregisterChargedToken).toHaveBeenNthCalledWith(2, "0xCT2");
  });

  test("should trigger interface removal if charged token has any", async () => {
    const unregisterInterfaceProjectToken = jest.spyOn(watcher, "unregisterInterfaceProjectToken");
    unregisterInterfaceProjectToken.mockImplementation(async () => undefined);

    blockchain.getLastState.mockResolvedValueOnce({ interfaceProjectToken: "0xINTERFACE" } as IChargedToken);
    blockchain.unregisterContract.mockResolvedValueOnce(undefined);

    await watcher.unregisterChargedToken(ADDRESS);

    expect(blockchain.getLastState).toBeCalledWith("ChargedToken", ADDRESS);
    expect(blockchain.unregisterContract).toBeCalledWith("ChargedToken", ADDRESS);
    expect(unregisterInterfaceProjectToken).toHaveBeenCalledWith("0xINTERFACE");
  });

  test("should trigger project token removal if interface has one", async () => {
    const unregisterDelegableToLT = jest.spyOn(watcher, "unregisterDelegableToLT");
    unregisterDelegableToLT.mockImplementation(async () => undefined);

    blockchain.getLastState.mockResolvedValueOnce({ projectToken: "0xPT" } as IInterfaceProjectToken);
    blockchain.unregisterContract.mockResolvedValueOnce(undefined);

    await watcher.unregisterInterfaceProjectToken(ADDRESS);

    expect(blockchain.getLastState).toBeCalledWith("InterfaceProjectToken", ADDRESS);
    expect(blockchain.unregisterContract).toBeCalledWith("InterfaceProjectToken", ADDRESS);
    expect(unregisterDelegableToLT).toHaveBeenCalledWith("0xPT");
  });

  test("should remove project token only if it has no reference", async () => {
    blockchain.isDelegableStillReferenced.mockResolvedValueOnce(false);
    blockchain.unregisterContract.mockResolvedValueOnce(undefined);

    await watcher.unregisterDelegableToLT(ADDRESS);

    expect(blockchain.isDelegableStillReferenced).toBeCalledWith(ADDRESS);
    expect(blockchain.unregisterContract).toBeCalledWith("DelegableToLT", ADDRESS);
  });

  test("should not remove project token only if it still is referenced", async () => {
    blockchain.isDelegableStillReferenced.mockResolvedValueOnce(true);
    blockchain.unregisterContract.mockResolvedValueOnce(undefined);

    await watcher.unregisterDelegableToLT(ADDRESS);

    expect(blockchain.isDelegableStillReferenced).toBeCalledWith(ADDRESS);
    expect(blockchain.unregisterContract).not.toBeCalled();
  });
});
