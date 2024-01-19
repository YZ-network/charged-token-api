import { OnRequestEventPayload } from "@whatwg-node/server";
import { useEventsExporter } from "../exporter";
import { EventHandlerStatus } from "../globals";
import { EventModel } from "../models";

jest.mock("../models");

async function streamToString(stream: ReadableStream<Uint8Array>): Promise<string> {
  const chunks: string[] = [];

  for await (const chunk of stream) {
    chunks.push(String.fromCharCode(...chunk));
  }

  return chunks.join("");
}

describe("Events exporter", () => {
  it("should return events as csv file", async () => {
    const events = [
      {
        chainId: 1337,
        blockDate: "1 Jan 1970 00:00",
        blockNumber: 15,
        txIndex: 1,
        logIndex: 1,
        status: EventHandlerStatus.SUCCESS,
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
        status: EventHandlerStatus.SUCCESS,
        contract: "Contract",
        address: "0xADDR",
        name: "EventName",
        args: [],
        txHash: "0xtxHash2",
        topics: [],
      },
    ];
    const sortMock = { sort: jest.fn(async () => events) };
    (EventModel as any).find.mockReturnValueOnce(sortMock);

    const { onRequest: requestHandler } = useEventsExporter();

    let response: Response | undefined;
    const endResponse = jest.fn((realResponse) => (response = realResponse));

    await requestHandler!({
      request: {
        method: "GET",
        url: "http://localhost:3000/export",
      },
      endResponse,
    } as unknown as OnRequestEventPayload<object>);

    expect(EventModel.find).toBeCalledTimes(1);
    expect(sortMock.sort).toBeCalledWith({
      blockNumber: "asc",
      txIndex: "asc",
      logIndex: "asc",
    });

    expect(response).toBeDefined();
    expect(endResponse).toBeCalledWith(response);
    expect(response?.headers.get("Content-Type")).toBe("text/csv");

    const body = await streamToString(response!.body!);
    expect(body).toBe(
      "chainId;blockDate;blockNumber;txIndex;logIndex;status;contract;address;name;args;txHash;topics\n1337;1 Jan 1970 00:00;15;1;1;SUCCESS;Contract;0xADDR;EventName;;0xtxHash1;\n1337;1 Jan 1970 00:00;15;1;2;SUCCESS;Contract;0xADDR;EventName;;0xtxHash2;\n",
    );
  });
});
