import { ethers } from "ethers";
import { ClientSession } from "mongodb";
import { AbstractBlockchainRepository } from "../../AbstractBlockchainRepository";
import { MockBlockchainRepository } from "../../__mocks__/MockBlockchainRepository";
import { ChargedToken } from "../ChargedToken";
import { Directory } from "../Directory";

jest.mock("../../../config");

describe("Directory loader", () => {
  const CHAIN_ID = 1337;
  const OWNER = "0x493942A95Bc6Db03CE8Cc22ff5a0441Dcc581f45";
  const ADDRESS = "0xF79A6c67E99b2135E09C3Ba0d06AE60977C1f393";
  const BLOCK_NUMBER = 15;

  let blockchain: jest.Mocked<AbstractBlockchainRepository>;
  let provider: ethers.providers.JsonRpcProvider;
  let loaderFactory: jest.Mock;
  let loader: Directory;
  let session: ClientSession;

  beforeEach(() => {
    provider = new ethers.providers.JsonRpcProvider();
    blockchain = new MockBlockchainRepository() as jest.Mocked<AbstractBlockchainRepository>;
    loaderFactory = jest.fn();
    loader = new Directory(CHAIN_ID, blockchain, ADDRESS, loaderFactory);
    session = new ClientSession();
  });

  function sampleData() {
    return {
      chainId: CHAIN_ID,
      initBlock: BLOCK_NUMBER,
      lastUpdateBlock: BLOCK_NUMBER,
      address: ADDRESS,
      owner: OWNER,
      directory: [],
      whitelistedProjectOwners: [],
      projects: [],
      projectRelatedToLT: {},
      whitelist: {},
      areUserFunctionsDisabled: false,
    };
  }

  // Event handlers
  test("Events routing", async () => {
    const eventName = "OwnershipTransferred";
    const eventHandler = jest.spyOn(loader, "onOwnershipTransferredEvent");

    const BLOCK_NUMBER = 15;

    // handler under test
    await loader.onEvent(session, eventName, ["any_arg"], BLOCK_NUMBER, {
      blockNumber: BLOCK_NUMBER,
      blockHash: "0x",
      address: "0x",
      data: "0x",
      logIndex: 0,
      transactionIndex: 0,
      removed: false,
      topics: [],
      transactionHash: "0x",
    });

    expect(eventHandler).toHaveBeenNthCalledWith(1, session, ["any_arg"], BLOCK_NUMBER, "OwnershipTransferred");
  });

  test("UserFunctionsAreDisabled", async () => {
    const loadedModel = sampleData();
    const updateFunc = jest.spyOn(loader, "applyUpdateAndNotify");

    blockchain.getLastState.mockResolvedValueOnce(loadedModel);

    await loader.onUserFunctionsAreDisabledEvent(session, [true], BLOCK_NUMBER, "UserFunctionsAreDisabled");

    expect(blockchain.getLastState).toBeCalledTimes(0);
    expect(updateFunc).toHaveBeenCalledWith(
      {
        areUserFunctionsDisabled: true,
      },
      BLOCK_NUMBER,
      "UserFunctionsAreDisabled",
      session,
    );
  });

  test("ProjectOwnerWhitelisted", async () => {
    const PROJECT_OWNER = "0xPROJ_OWNER";
    const PROJECT_NAME = "Project name";

    const loadedModel = {
      ...sampleData(),
      projects: ["A", "B"],
      whitelistedProjectOwners: ["0xA", "0xB"],
      whitelist: {
        "0xA": "A",
        "0xB": "B",
      },
    };

    const updateFunc = jest.spyOn(loader, "applyUpdateAndNotify");

    blockchain.getLastState.mockResolvedValue(loadedModel);

    await loader.onProjectOwnerWhitelistedEvent(
      session,
      [PROJECT_OWNER, PROJECT_NAME],
      BLOCK_NUMBER,
      "ProjectOwnerWhitelisted",
    );

    expect(blockchain.getLastState).toBeCalledTimes(1);
    expect(updateFunc).toHaveBeenCalledWith(
      {
        projects: ["A", "B", PROJECT_NAME],
        whitelistedProjectOwners: ["0xA", "0xB", PROJECT_OWNER],
        whitelist: {
          "0xA": "A",
          "0xB": "B",
          [PROJECT_OWNER]: PROJECT_NAME,
        },
      },
      BLOCK_NUMBER,
      "ProjectOwnerWhitelisted",
      session,
    );
  });

  test("AddedLTContract", async () => {
    const CONTRACT = "0xCONTRACT";
    const PROJECT = "PROJECT";

    const loadedModel = {
      ...sampleData(),
      directory: ["0xA", "0xB"],
      projectRelatedToLT: {
        "0xA": "A",
      },
    };

    const updateFunc = jest.spyOn(loader, "applyUpdateAndNotify");

    // mocking
    blockchain.getLastState.mockResolvedValueOnce(loadedModel);
    blockchain.getProjectRelatedToLT.mockResolvedValueOnce(PROJECT);
    loaderFactory.mockReturnValueOnce(new ChargedToken(CHAIN_ID, blockchain, CONTRACT, loaderFactory));

    // handler under test
    await loader.onAddedLTContractEvent(session, [CONTRACT], BLOCK_NUMBER, "AddedLTContract");

    expect(blockchain.getLastState).toHaveBeenCalled();
    expect(blockchain.getProjectRelatedToLT).toHaveBeenNthCalledWith(1, ADDRESS, CONTRACT);
    expect(blockchain.registerContract).toHaveBeenCalledWith(
      "ChargedToken",
      CONTRACT,
      BLOCK_NUMBER,
      expect.any(ChargedToken),
    );
    expect(loaderFactory).toHaveBeenCalledWith("ChargedToken", CHAIN_ID, CONTRACT, blockchain);

    expect(updateFunc).toHaveBeenCalledWith(
      {
        directory: ["0xA", "0xB", CONTRACT],
        projectRelatedToLT: {
          "0xA": "A",
          [CONTRACT]: PROJECT,
        },
      },
      BLOCK_NUMBER,
      "AddedLTContract",
      session,
    );
  });

  test("OwnershipTransferred", async () => {
    const updateFunc = jest.spyOn(loader, "applyUpdateAndNotify");

    const NEW_OWNER = "0xOWNER";

    // handler under test
    await loader.onOwnershipTransferredEvent(session, [NEW_OWNER], BLOCK_NUMBER, "OwnershipTransferred");

    expect(updateFunc).toHaveBeenCalledWith({ owner: NEW_OWNER }, BLOCK_NUMBER, "OwnershipTransferred", session);
  });

  test("RemovedLTContract", async () => {
    const ctAddress = "0xCT";
    const ctAddressNotToRemove = "0xCT2";

    const loadedModel = {
      address: ADDRESS,
      directory: [ctAddressNotToRemove, ctAddress],
      projectRelatedToLT: {
        [ctAddressNotToRemove]: "SOME PROJECT",
        [ctAddress]: "ANOTHER PROJECT",
      },
    };

    const loadedInterface = {
      address: "0xIFACE",
      projectToken: "0xPT",
    } as IInterfaceProjectToken;

    const updateFunc = jest.spyOn(loader, "applyUpdateAndNotify");

    blockchain.getLastState.mockResolvedValue(loadedModel);

    // handler under test
    await loader.onRemovedLTContractEvent(session, [ctAddress], BLOCK_NUMBER, "RemovedLTContractEvent");

    expect(blockchain.getLastState).toBeCalled();
    expect(blockchain.unregisterContract).toBeCalledWith("ChargedToken", ctAddress, true, session);

    expect(updateFunc).toHaveBeenNthCalledWith(
      1,
      {
        directory: [ctAddressNotToRemove],
        projectRelatedToLT: {
          [ctAddressNotToRemove]: "SOME PROJECT",
        },
      },
      BLOCK_NUMBER,
      "RemovedLTContractEvent",
      session,
    );
  });

  test("RemovedProjectByAdmin", async () => {
    const updateFunc = jest.spyOn(loader, "applyUpdateAndNotify");

    const ownerToRemove = "0xOWNER_TO_REMOVE";

    const loadedModel = {
      address: ADDRESS,
      directory: ["0xCT1", "0xCT2"],
      projects: ["Project 1", "Project 2"],
      whitelistedProjectOwners: ["0xFirst_owner", ownerToRemove],
      whitelist: {
        "0xFirst_owner": "Project 1",
        [ownerToRemove]: "Project 2",
      },
      projectRelatedToLT: {
        "0xCT1": "Project 1",
        "0xCT2": "Project 2",
      },
    };

    blockchain.getLastState.mockResolvedValueOnce(loadedModel);

    // handler under test
    await loader.onRemovedProjectByAdminEvent(session, [ownerToRemove], BLOCK_NUMBER, "RemovedProjectByAdmin");

    expect(updateFunc).toHaveBeenNthCalledWith(
      1,
      {
        projects: ["Project 1"],
        whitelistedProjectOwners: ["0xFirst_owner"],
        whitelist: {
          "0xFirst_owner": "Project 1",
        },
      },
      BLOCK_NUMBER,
      "RemovedProjectByAdmin",
      session,
    );
  });

  test("ChangedProjectOwnerAccount", async () => {
    const updateFunc = jest.spyOn(loader, "applyUpdateAndNotify");

    const oldOwner = "0xOLD_OWNER";
    const newOwner = "0xNEW_OWNER";

    const loadedModel = {
      address: ADDRESS,
      directory: ["0xCT1", "0xCT2"],
      projects: ["Project 1", "Project 2"],
      whitelistedProjectOwners: [oldOwner, "0xSecond_owner"],
      whitelist: {
        [oldOwner]: "Project 1",
        "0xSecond_owner": "Project 2",
      },
      projectRelatedToLT: {
        "0xCT1": "Project 1",
        "0xCT2": "Project 2",
      },
    };

    blockchain.getLastState.mockResolvedValueOnce(loadedModel);

    // handler under test
    await loader.onChangedProjectOwnerAccountEvent(
      session,
      [oldOwner, newOwner],
      BLOCK_NUMBER,
      "ChangedProjectOwnerAccount",
    );

    expect(updateFunc).toHaveBeenNthCalledWith(
      1,
      {
        whitelistedProjectOwners: ["0xSecond_owner", newOwner],
        whitelist: {
          [newOwner]: "Project 1",
          "0xSecond_owner": "Project 2",
        },
      },
      BLOCK_NUMBER,
      "ChangedProjectOwnerAccount",
      session,
    );
  });

  test("ChangedProjectName", async () => {
    const updateFunc = jest.spyOn(loader, "applyUpdateAndNotify");

    const oldName = "Project 1";
    const newName = "Project 11";

    const loadedModel = {
      address: ADDRESS,
      directory: ["0xCT1", "0xCT2"],
      projects: [oldName, "Project 2"],
      whitelistedProjectOwners: ["0xFirst_owner", "0xSecond_owner"],
      whitelist: {
        "0xFirst_owner": "Project 1",
        "0xSecond_owner": "Project 2",
      },
      projectRelatedToLT: {
        "0xCT1": "Project 1",
        "0xCT2": "Project 2",
      },
    };

    blockchain.getLastState.mockResolvedValueOnce(loadedModel);

    // handler under test
    await loader.onChangedProjectNameEvent(session, [oldName, newName], BLOCK_NUMBER, "ChangedProjectName");

    expect(updateFunc).toHaveBeenNthCalledWith(
      1,
      {
        projects: ["Project 2", newName],
      },
      BLOCK_NUMBER,
      "ChangedProjectName",
      session,
    );
  });

  test("AllocatedLTToProject", async () => {
    const updateFunc = jest.spyOn(loader, "applyUpdateAndNotify");

    const newCT = "0xCT2";

    const loadedModel = {
      address: ADDRESS,
      directory: ["0xCT1"],
      projects: ["Project 1", "Project 2"],
      whitelistedProjectOwners: ["0xFirst_owner", "0xSecond_owner"],
      whitelist: {
        "0xFirst_owner": "Project 1",
        "0xSecond_owner": "Project 2",
      },
      projectRelatedToLT: {
        "0xCT1": "Project 1",
      },
    };

    blockchain.getLastState.mockResolvedValueOnce(loadedModel);

    // handler under test
    await loader.onAllocatedLTToProjectEvent(session, [newCT, "Project 2"], BLOCK_NUMBER, "AllocatedLTToProject");

    expect(updateFunc).toHaveBeenNthCalledWith(
      1,
      {
        projectRelatedToLT: {
          "0xCT1": "Project 1",
          [newCT]: "Project 2",
        },
      },
      BLOCK_NUMBER,
      "AllocatedLTToProject",
      session,
    );
  });

  test("AllocatedProjectOwnerToProject", async () => {
    const updateFunc = jest.spyOn(loader, "applyUpdateAndNotify");

    const newOwner = "0xNEW_OWNER";

    const loadedModel = {
      address: ADDRESS,
      directory: ["0xCT1"],
      projects: ["Project 1", "Project 2"],
      whitelistedProjectOwners: ["0xFirst_owner", "0xSecond_owner"],
      whitelist: {
        "0xFirst_owner": "Project 1",
      },
      projectRelatedToLT: {
        "0xCT1": "Project 1",
      },
    };

    blockchain.getLastState.mockResolvedValueOnce(loadedModel);

    // handler under test
    await loader.onAllocatedProjectOwnerToProjectEvent(
      session,
      [newOwner, "Project 2"],
      BLOCK_NUMBER,
      "AllocatedProjectOwnerToProject",
    );

    expect(updateFunc).toHaveBeenNthCalledWith(
      1,
      {
        whitelist: {
          "0xFirst_owner": "Project 1",
          [newOwner]: "Project 2",
        },
      },
      BLOCK_NUMBER,
      "AllocatedProjectOwnerToProject",
      session,
    );
  });
});
