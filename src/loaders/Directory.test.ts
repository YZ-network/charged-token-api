import { BigNumber, ethers } from "ethers";
import { ClientSession } from "mongodb";
import { Directory } from "./Directory";
import { EventListener } from "./EventListener";

jest.mock("./EventListener");
jest.mock("../topics");
jest.mock("../graphql");
jest.mock("../models");

describe("Directory loader", () => {
  const CHAIN_ID = 1337;
  const OWNER = "0x493942A95Bc6Db03CE8Cc22ff5a0441Dcc581f45";
  const ADDRESS = "0xF79A6c67E99b2135E09C3Ba0d06AE60977C1f393";

  test("Should initialize Directory when nothing is available", async () => {
    const eventListener = new EventListener();
    const provider = new ethers.providers.JsonRpcProvider();
    const loader = new Directory(eventListener, CHAIN_ID, provider, ADDRESS);

    expect(loader.chainId).toBe(CHAIN_ID);
    expect(loader.provider).toBe(provider);
    expect(loader.eventsListener).toBe(eventListener);
    expect(loader.address).toBe(ADDRESS);

    const session = new ClientSession();

    const modelInstanceMock = { save: jest.fn() };

    (loader.model as any).exists.mockImplementation(async () => null);
    (loader.model as any).toModel.mockImplementation(() => modelInstanceMock);
    (loader.model as any).toGraphQL.mockImplementation(() => {
      return {
        directory: [],
      };
    });

    loader.instance.countWhitelistedProjectOwners.mockImplementation(async () =>
      BigNumber.from(0)
    );
    loader.instance.countLTContracts.mockImplementation(async () =>
      BigNumber.from(0)
    );
    loader.instance.owner.mockImplementation(async () => OWNER);
    loader.instance.areUserFunctionsDisabled.mockImplementation(
      async () => false
    );

    await loader.init(session);
  });
});
