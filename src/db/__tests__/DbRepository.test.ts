import { DbRepository } from "../DbRepository";
import { ChargedTokenModel } from "../models/ChargedToken";
import { DelegableToLTModel } from "../models/DelegableToLT";
import { DirectoryModel } from "../models/Directory";
import { EventModel } from "../models/Event";
import { InterfaceProjectTokenModel } from "../models/InterfaceProjectToken";
import { UserBalanceModel } from "../models/UserBalances";

jest.mock("../models/Directory");
jest.mock("../models/ChargedToken");
jest.mock("../models/InterfaceProjectToken");
jest.mock("../models/DelegableToLT");
jest.mock("../models/UserBalances");
jest.mock("../models/Event");

describe("DbRepository", () => {
  const CHAIN_ID = 1337;
  const ADDRESS = "0xADDRESS";

  let db: DbRepository;

  beforeEach(() => {
    db = new DbRepository();
  });

  it("should be able to start a new session", async () => {
    const session = await db.startSession();

    expect(session).toBeDefined();
  });

  it("should check contract in db using the right model", async () => {
    const session = await db.startSession();

    const sessionSetterReturnsNull = { session: jest.fn() };
    sessionSetterReturnsNull.session.mockResolvedValue(null);

    const sessionSetterReturnsValue = { session: jest.fn() };
    sessionSetterReturnsValue.session.mockResolvedValue({});

    DirectoryModel.exists.mockReturnValueOnce(sessionSetterReturnsNull);
    ChargedTokenModel.exists.mockReturnValueOnce(sessionSetterReturnsValue);
    InterfaceProjectTokenModel.exists.mockReturnValueOnce(sessionSetterReturnsNull);
    DelegableToLTModel.exists.mockReturnValueOnce(sessionSetterReturnsValue);
    UserBalanceModel.exists.mockReturnValueOnce(sessionSetterReturnsNull);

    expect(await db.exists("Directory", CHAIN_ID, ADDRESS, session)).toBe(false);
    expect(DirectoryModel.exists).toBeCalledWith({ chainId: CHAIN_ID, address: ADDRESS });

    expect(await db.exists("ChargedToken", CHAIN_ID, ADDRESS, session)).toBe(true);
    expect(ChargedTokenModel.exists).toBeCalledWith({ chainId: CHAIN_ID, address: ADDRESS });

    expect(await db.exists("InterfaceProjectToken", CHAIN_ID, ADDRESS, session)).toBe(false);
    expect(InterfaceProjectTokenModel.exists).toBeCalledWith({ chainId: CHAIN_ID, address: ADDRESS });

    expect(await db.exists("DelegableToLT", CHAIN_ID, ADDRESS, session)).toBe(true);
    expect(DelegableToLTModel.exists).toBeCalledWith({ chainId: CHAIN_ID, address: ADDRESS });

    expect(await db.exists("UserBalance", CHAIN_ID, ADDRESS, session)).toBe(false);
    expect(UserBalanceModel.exists).toBeCalledWith({ chainId: CHAIN_ID, address: ADDRESS });

    expect(db.exists("Event", CHAIN_ID, ADDRESS, session)).rejects.toThrow("Unhandled data type : Event");

    expect(sessionSetterReturnsNull.session).toBeCalledTimes(3);
    expect(sessionSetterReturnsNull.session).toBeCalledWith(session);
    expect(sessionSetterReturnsValue.session).toBeCalledTimes(2);
    expect(sessionSetterReturnsValue.session).toBeCalledWith(session);
  });

  it("should check balance in db", async () => {
    UserBalanceModel.exists.mockResolvedValueOnce(null).mockResolvedValueOnce({});

    expect(await db.existsBalance(CHAIN_ID, ADDRESS, "0xUSER")).toBe(false);
    expect(await db.existsBalance(CHAIN_ID, ADDRESS, "0xUSER")).toBe(true);

    expect(UserBalanceModel.exists).toBeCalledTimes(2);
    expect(UserBalanceModel.exists).toBeCalledWith({ chainId: CHAIN_ID, address: ADDRESS, user: "0xUSER" });
  });

  it("should check event in db", async () => {
    const session = await db.startSession();

    const sessionSetterReturnsNull = { session: jest.fn() };
    sessionSetterReturnsNull.session.mockResolvedValue(null);

    const sessionSetterReturnsValue = { session: jest.fn() };
    sessionSetterReturnsValue.session.mockResolvedValue({});

    EventModel.exists.mockReturnValueOnce(sessionSetterReturnsNull).mockReturnValueOnce(sessionSetterReturnsValue);

    expect(await db.existsEvent(CHAIN_ID, ADDRESS, 15, 1, 2, session)).toBe(false);
    expect(await db.existsEvent(CHAIN_ID, ADDRESS, 15, 1, 2, session)).toBe(true);

    expect(EventModel.exists).toBeCalledTimes(2);
    expect(EventModel.exists).toBeCalledWith({
      chainId: CHAIN_ID,
      address: ADDRESS,
      blockNumber: 15,
      txIndex: 1,
      logIndex: 2,
    });
  });

  it("should check user balances in db and return true if he has balances for every charged token", async () => {
    ChargedTokenModel.count.mockResolvedValueOnce(10);
    UserBalanceModel.count.mockResolvedValueOnce(9);

    expect(await db.isUserBalancesLoaded(CHAIN_ID, "0xUSER")).toBe(false);

    expect(ChargedTokenModel.count).toBeCalledWith({ chainId: CHAIN_ID });
    expect(UserBalanceModel.count).toBeCalledWith({
      chainId: CHAIN_ID,
      user: "0xUSER",
    });
  });

  it("should check user balances in db and return true if he has balances for every charged token", async () => {
    ChargedTokenModel.count.mockResolvedValueOnce(10);
    UserBalanceModel.count.mockResolvedValueOnce(10);

    expect(await db.isUserBalancesLoaded(CHAIN_ID, "0xUSER")).toBe(true);
  });

  it("should count events in db", async () => {
    EventModel.count.mockResolvedValueOnce(10);

    expect(await db.countEvents(CHAIN_ID)).toBe(10);
    expect(EventModel.count).toBeCalledWith({ chainId: CHAIN_ID });
  });

  it("should check contract in db using the right model", async () => {
    const session = await db.startSession();

    const toJSON = jest.fn(() => "result");

    const sessionSetterReturnsNull = { session: jest.fn() };
    sessionSetterReturnsNull.session.mockResolvedValue(null);

    const document = { toJSON };
    const sessionSetterReturnsValue = { session: jest.fn() };
    sessionSetterReturnsValue.session.mockResolvedValue(document);

    DirectoryModel.findOne.mockReturnValueOnce(sessionSetterReturnsNull);
    ChargedTokenModel.findOne.mockReturnValueOnce(sessionSetterReturnsValue);
    InterfaceProjectTokenModel.findOne.mockReturnValueOnce(sessionSetterReturnsNull);
    DelegableToLTModel.findOne.mockReturnValueOnce(sessionSetterReturnsValue);

    expect(await db.get("Directory", CHAIN_ID, ADDRESS, session)).toBe(null);
    expect(DirectoryModel.findOne).toBeCalledWith({ chainId: CHAIN_ID, address: ADDRESS });

    expect(await db.get("ChargedToken", CHAIN_ID, ADDRESS, session)).toBe("result");
    expect(ChargedTokenModel.findOne).toBeCalledWith({ chainId: CHAIN_ID, address: ADDRESS });

    expect(await db.get("InterfaceProjectToken", CHAIN_ID, ADDRESS, session)).toBe(null);
    expect(InterfaceProjectTokenModel.findOne).toBeCalledWith({ chainId: CHAIN_ID, address: ADDRESS });

    expect(await db.get("DelegableToLT", CHAIN_ID, ADDRESS, session)).toBe("result");
    expect(DelegableToLTModel.findOne).toBeCalledWith({ chainId: CHAIN_ID, address: ADDRESS });

    expect(db.exists("Event", CHAIN_ID, ADDRESS, session)).rejects.toThrow("Unhandled data type : Event");

    expect(sessionSetterReturnsNull.session).toBeCalledTimes(2);
    expect(sessionSetterReturnsNull.session).toBeCalledWith(session);
    expect(sessionSetterReturnsValue.session).toBeCalledTimes(2);
    expect(sessionSetterReturnsValue.session).toBeCalledWith(session);
    expect(toJSON).toBeCalledTimes(2);
  });

  it("should return documents matching filter", async () => {
    const contracts = [
      { chainId: CHAIN_ID, address: "0xCT1" },
      { chainId: CHAIN_ID, address: "0xCT2" },
    ];
    const results = contracts.map((contract) => ({ toJSON: jest.fn(() => contract) }));

    ChargedTokenModel.find.mockResolvedValueOnce(results);

    expect(await db.getAllMatching("ChargedToken", { chainId: CHAIN_ID })).toStrictEqual(contracts);
    expect(ChargedTokenModel.find).toBeCalledWith({ chainId: CHAIN_ID });
  });
});
