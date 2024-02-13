import { DbRepository } from "../DbRepository";

describe("DbRepository", () => {
  let db: DbRepository;

  beforeEach(() => {
    db = new DbRepository();
  });

  it("should be able to start a new session", async () => {
    const session = await db.startSession();

    expect(session).toBeDefined();
  });
});
