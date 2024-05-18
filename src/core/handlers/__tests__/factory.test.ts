import type { AbstractBlockchainRepository } from "../../AbstractBlockchainRepository";
import { MockBlockchainRepository } from "../../__mocks__/MockBlockchainRepository";
import { ChargedToken } from "../ChargedToken";
import { DelegableToLT } from "../DelegableToLT";
import { Directory } from "../Directory";
import { InterfaceProjectToken } from "../InterfaceProjectToken";
import { handlerFactory } from "../factory";

jest.mock("../Directory");
jest.mock("../ChargedToken");
jest.mock("../InterfaceProjectToken");
jest.mock("../DelegableToLT");

describe("Handler factory", () => {
  const CHAIN_ID = 1337;
  const ADDRESS = "0xADDRESS";

  let blockchain: jest.Mocked<AbstractBlockchainRepository>;

  beforeEach(() => {
    blockchain = new MockBlockchainRepository() as jest.Mocked<AbstractBlockchainRepository>;
  });

  it("should instantiate Directory handler", () => {
    const handler = handlerFactory("Directory", CHAIN_ID, ADDRESS, blockchain);

    expect(handler).toBeDefined();
    expect(handler).toStrictEqual({ type: "Directory" });
    expect(Directory).toBeCalledWith(CHAIN_ID, blockchain, ADDRESS, handlerFactory);
  });

  it("should instantiate ChargedToken handler", () => {
    const handler = handlerFactory("ChargedToken", CHAIN_ID, ADDRESS, blockchain);

    expect(handler).toBeDefined();
    expect(handler).toStrictEqual({ type: "ChargedToken" });
    expect(ChargedToken).toBeCalledWith(CHAIN_ID, blockchain, ADDRESS, handlerFactory);
  });

  it("should instantiate InterfaceProjectToken handler", () => {
    const handler = handlerFactory("InterfaceProjectToken", CHAIN_ID, ADDRESS, blockchain);

    expect(handler).toBeDefined();
    expect(handler).toStrictEqual({ type: "InterfaceProjectToken" });
    expect(InterfaceProjectToken).toBeCalledWith(CHAIN_ID, blockchain, ADDRESS, handlerFactory);
  });

  it("should instantiate DelegableToLT handler", () => {
    const handler = handlerFactory("DelegableToLT", CHAIN_ID, ADDRESS, blockchain);

    expect(handler).toBeDefined();
    expect(handler).toStrictEqual({ type: "DelegableToLT" });
    expect(DelegableToLT).toBeCalledWith(CHAIN_ID, blockchain, ADDRESS, handlerFactory);
  });

  it("should throw for invalid handler type", () => {
    expect(() => handlerFactory("UserBalance", CHAIN_ID, ADDRESS, blockchain)).toThrow();
  });
});
