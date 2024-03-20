import { OnRequestEventPayload } from "@whatwg-node/server";
import { Metrics } from "../../metrics";
import { usePrometheus } from "../prometheus";

async function streamToString(stream: ReadableStream<Uint8Array>): Promise<string> {
  const chunks: string[] = [];

  for await (const chunk of stream) {
    chunks.push(String.fromCharCode(...chunk));
  }

  return chunks.join("");
}

describe("Prometheus middleware", () => {
  it("should return metrics dump", async () => {
    const dumpMock = jest.spyOn(Metrics, "dumpMetrics");
    dumpMock.mockReturnValueOnce("dumped metrics");

    let response: Response | undefined;
    const endResponse = jest.fn((realResponse) => (response = realResponse));
    const { onRequest: requestHandler } = usePrometheus();

    await requestHandler!({
      request: {
        method: "GET",
        url: "http://localhost:3000/metrics",
      },
      endResponse,
    } as unknown as OnRequestEventPayload<object>);

    expect(dumpMock).toBeCalled();
    expect(response).toBeDefined();
    const body = await streamToString(response!.body as ReadableStream<Uint8Array>);
    expect(body).toBe("dumped metrics");
  });
});
