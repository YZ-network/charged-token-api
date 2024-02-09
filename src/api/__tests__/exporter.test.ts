import { OnRequestEventPayload } from "@whatwg-node/server";
import { AbstractDbRepository } from "../core/AbstractDbRepository";
import { MockDbRepository } from "../core/__mocks__/MockDbRepository";
import { eventsExporterFactory } from "../exporter";

jest.mock("../db");

async function streamToString(stream: ReadableStream<Uint8Array>): Promise<string> {
  const chunks: string[] = [];

  for await (const chunk of stream) {
    chunks.push(String.fromCharCode(...chunk));
  }

  return chunks.join("");
}

describe("Events exporter", () => {
  let db: jest.Mocked<AbstractDbRepository>;

  beforeEach(() => {
    db = new MockDbRepository() as jest.Mocked<AbstractDbRepository>;
  });

  it("should return events as csv file", async () => {
    const events = [
      {
        chainId: 1337,
        blockDate: "1 Jan 1970 00:00",
        blockNumber: 15,
        txIndex: 1,
        logIndex: 1,
        status: "SUCCESS",
        contract: "Contract",
        address: "0xADDR",
        name: "EventName",
        args: [],
        txHash: "0xtxHash1",
        topics: [],
      },
      {
        chainId: 1337,
        blockDate: "1 Jan 1970 00:00",
        blockNumber: 15,
        txIndex: 1,
        logIndex: 2,
        status: "SUCCESS",
        contract: "Contract",
        address: "0xADDR",
        name: "EventName",
        args: [],
        txHash: "0xtxHash2",
        topics: [],
      },
    ] as IEvent[];
    db.getAllEvents.mockResolvedValueOnce(events);

    const { onRequest: requestHandler } = eventsExporterFactory(db)();

    let response: Response | undefined;
    const endResponse = jest.fn((realResponse) => (response = realResponse));

    await requestHandler!({
      request: {
        method: "GET",
        url: "http://localhost:3000/export",
      },
      endResponse,
    } as unknown as OnRequestEventPayload<object>);

    expect(db.getAllEvents).toBeCalledTimes(1);

    expect(response).toBeDefined();
    expect(endResponse).toBeCalledWith(response);
    expect(response?.headers.get("Content-Type")).toBe("text/csv");

    const body = await streamToString(response!.body!);
    expect(body).toBe(
      "chainId;blockDate;blockNumber;txIndex;logIndex;status;contract;address;name;args;txHash;topics\n1337;1 Jan 1970 00:00;15;1;1;SUCCESS;Contract;0xADDR;EventName;;0xtxHash1;\n1337;1 Jan 1970 00:00;15;1;2;SUCCESS;Contract;0xADDR;EventName;;0xtxHash2;\n",
    );
  });
});
