import { ClientSession } from "mongodb";
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
  let session: jest.Mocked<ClientSession>;

  beforeEach(() => {
    db = new DbRepository();
    session = new ClientSession() as jest.Mocked<ClientSession>;
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

  it("should return the directory for the given chainId", async () => {
    const toJSON = jest.fn(() => "result");
    const document = { toJSON };
    DirectoryModel.findOne.mockResolvedValueOnce(document);

    const result = await db.getDirectory(CHAIN_ID);

    expect(result).toBe("result");
    expect(DirectoryModel.findOne).toBeCalledWith({ chainId: CHAIN_ID });
    expect(toJSON).toBeCalled();
  });

  it("should return the interface for the given chainId and charged token address", async () => {
    const toJSON = jest.fn(() => "result");
    const document = { toJSON };
    InterfaceProjectTokenModel.findOne.mockResolvedValueOnce(document);

    const result = await db.getInterfaceByChargedToken(CHAIN_ID, ADDRESS);

    expect(result).toBe("result");
    expect(InterfaceProjectTokenModel.findOne).toBeCalledWith({ chainId: CHAIN_ID, liquidityToken: ADDRESS });
    expect(toJSON).toBeCalled();
  });

  it("should return the balances for the given user address", async () => {
    const balance1 = { user: "0xUSER", address: "0xCT1" };
    const balance2 = { user: "0xUSER", address: "0xCT2" };
    const docBalance1 = { toJSON: jest.fn(() => balance1) };
    const docBalance2 = { toJSON: jest.fn(() => balance2) };

    const sessionMock = { session: jest.fn() };

    UserBalanceModel.find.mockReturnValueOnce(sessionMock);
    sessionMock.session.mockResolvedValueOnce([docBalance1, docBalance2]);

    const result = await db.getBalances(CHAIN_ID, "0xUSER", session);

    expect(result).toStrictEqual([balance1, balance2]);
    expect(UserBalanceModel.find).toBeCalledWith({ chainId: CHAIN_ID, user: "0xUSER" });
    expect(sessionMock.session).toBeCalledWith(session);
    expect(docBalance1.toJSON).toBeCalled();
    expect(docBalance2.toJSON).toBeCalled();
  });

  it("should return the balance for the given user and charged token address", async () => {
    const balance = { user: "0xUSER", address: "0xCT1" };
    const docBalance = { toJSON: jest.fn(() => balance) };

    const sessionMock = { session: jest.fn() };

    UserBalanceModel.findOne.mockReturnValueOnce(sessionMock);
    sessionMock.session.mockResolvedValueOnce(docBalance);

    const result = await db.getBalance(CHAIN_ID, ADDRESS, "0xUSER", session);

    expect(result).toStrictEqual(balance);
    expect(UserBalanceModel.findOne).toBeCalledWith({ chainId: CHAIN_ID, user: "0xUSER", address: ADDRESS });
    expect(sessionMock.session).toBeCalledWith(session);
    expect(docBalance.toJSON).toBeCalled();
  });

  it("should return the balances for the given user address and project token", async () => {
    const balance1 = { user: "0xUSER", address: "0xCT1", ptAddress: "0xPT" };
    const balance2 = { user: "0xUSER", address: "0xCT2", ptAddress: "0xPT" };
    const docBalance1 = { toJSON: jest.fn(() => balance1) };
    const docBalance2 = { toJSON: jest.fn(() => balance2) };

    const sessionMock = { session: jest.fn() };

    UserBalanceModel.find.mockReturnValueOnce(sessionMock);
    sessionMock.session.mockResolvedValueOnce([docBalance1, docBalance2]);

    const result = await db.getBalancesByProjectToken(CHAIN_ID, "0xPT", "0xUSER", session);

    expect(result).toStrictEqual([balance1, balance2]);
    expect(UserBalanceModel.find).toBeCalledWith({ chainId: CHAIN_ID, ptAddress: "0xPT", user: "0xUSER" });
    expect(sessionMock.session).toBeCalledWith(session);
    expect(docBalance1.toJSON).toBeCalled();
    expect(docBalance2.toJSON).toBeCalled();
  });

  it("should return the PT balance for the given user", async () => {
    const balance = { user: "0xUSER", address: "0xCT", ptAddress: "0xPT", balancePT: "10" };

    const sessionMock = { session: jest.fn() };

    UserBalanceModel.findOne.mockReturnValueOnce(sessionMock);
    sessionMock.session.mockResolvedValueOnce(balance);

    const result = await db.getPTBalance(CHAIN_ID, "0xPT", "0xUSER", session);

    expect(result).toStrictEqual(balance.balancePT);
    expect(UserBalanceModel.findOne).toBeCalledWith({ chainId: CHAIN_ID, user: "0xUSER", ptAddress: "0xPT" });
    expect(sessionMock.session).toBeCalledWith(session);
  });

  it("should return all events from the db", async () => {
    const event1 = { type: "Transfer" };
    const event2 = { type: "LTAllocated" };
    const docEvent1 = { toJSON: jest.fn(() => event1) };
    const docEvent2 = { toJSON: jest.fn(() => event2) };

    const sortMock = { sort: jest.fn() };

    EventModel.find.mockReturnValueOnce(sortMock);
    sortMock.sort.mockResolvedValueOnce([docEvent1, docEvent2]);

    const result = await db.getAllEvents();

    expect(result).toStrictEqual([event1, event2]);
    expect(EventModel.find).toBeCalled();
    expect(docEvent1.toJSON).toBeCalled();
    expect(docEvent2.toJSON).toBeCalled();
    expect(sortMock.sort).toBeCalledWith({ blockNumber: "asc", txIndex: "asc", logIndex: "asc" });
  });

  it("should return paginated events from the db", async () => {
    const event = { type: "Transfer" };
    const docEvent = { toJSON: jest.fn(() => event) };

    const limitMock = { limit: jest.fn() };
    const skipMock = { skip: jest.fn() };
    const sortMock = { sort: jest.fn() };

    EventModel.find.mockReturnValueOnce(limitMock);
    limitMock.limit.mockReturnValueOnce(skipMock);
    skipMock.skip.mockReturnValueOnce(sortMock);
    sortMock.sort.mockResolvedValueOnce([docEvent]);

    const result = await db.getEventsPaginated(CHAIN_ID, 10, 20);

    expect(result).toStrictEqual([event]);
    expect(EventModel.find).toBeCalled();
    expect(docEvent.toJSON).toBeCalled();
    expect(limitMock.limit).toBeCalledWith(10);
    expect(skipMock.skip).toBeCalledWith(20);
    expect(sortMock.sort).toBeCalledWith({ blockNumber: "asc", txIndex: "asc", logIndex: "asc" });
  });

  it("should check if an interface exists that references the given project token", async () => {
    InterfaceProjectTokenModel.exists.mockResolvedValueOnce({});

    const result = await db.isDelegableStillReferenced(CHAIN_ID, "0xPT");

    expect(result).toBe(true);
    expect(InterfaceProjectTokenModel.exists).toBeCalledWith({ chainId: CHAIN_ID, projectToken: "0xPT" });
  });
});
