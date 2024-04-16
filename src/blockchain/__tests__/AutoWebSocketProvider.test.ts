import { AutoWebSocketProvider } from "../AutoWebSocketProvider";

jest.unmock("ethers");

describe("AutoWebSocketProvider", () => {
  const URL = "ws://localhost";
  const chainId = 1337;

  it("should connect and start pinging to detect disconnects", async () => {
    const provider = new AutoWebSocketProvider(URL, { chainId, providerIndex: 1, pingDelayMs: 1 });

    Object.defineProperty(provider._websocket, "readyState", { value: 0 });

    expect(provider.index).toBe(1);
    expect(provider.websocket.onerror).toBeDefined();
    expect(provider.websocket.onclose).toBeDefined();
    expect(provider.websocket.onopen).toBeDefined();
    expect(provider.websocket.onmessage).toBeDefined();

    expect(provider._wsReady).toBe(false);
    expect(provider.pingInterval).toBeUndefined();
    expect(provider.pongTimeout).toBeUndefined();

    const sendMock = jest.spyOn(provider, "send");
    (sendMock as any).mockResolvedValue(chainId);

    provider.websocket.onopen!({ type: "test", target: provider.websocket });

    await new Promise((resolve) => setTimeout(resolve, 5));

    Object.defineProperty(provider._websocket, "readyState", { value: 1 });

    expect(sendMock).toBeCalled();
    expect(provider.websocket.on).toHaveBeenLastCalledWith("pong", expect.any(Function));
    expect(provider._wsReady).toBe(true);
    expect(provider.pingInterval).toBeDefined();
    expect(provider.websocket.ping).toBeCalled();

    await provider.destroy();

    expect(provider.pingInterval).toBeUndefined();
    expect(provider.pongTimeout).toBeUndefined();
  });

  it("should process request message responses by calling callback", async () => {
    const provider = new AutoWebSocketProvider(URL, { chainId, providerIndex: 1, pingDelayMs: 1 });

    Object.defineProperty(provider._websocket, "readyState", { value: 0 });
    const sendMock = jest.spyOn(provider, "send");
    (sendMock as any).mockResolvedValue(chainId);

    provider.websocket.onopen!({ type: "test", target: provider.websocket });

    await new Promise((resolve) => setTimeout(resolve, 5));

    Object.defineProperty(provider._websocket, "readyState", { value: 1 });

    const request = { id: 1, payload: "{}", callback: jest.fn() };
    provider._requests.push(request);
    const response = { id: request.id, result: { chainId } };

    provider.websocket.onmessage!({ type: "", data: JSON.stringify(response), target: provider.websocket });

    expect(provider._requests.length).toBe(0);
    expect(request.callback).toBeCalledWith(null, response.result);

    await provider.destroy();
  });

  it("should process request error responses by calling callback", async () => {
    const provider = new AutoWebSocketProvider(URL, { chainId, providerIndex: 1, pingDelayMs: 1 });

    Object.defineProperty(provider._websocket, "readyState", { value: 0 });
    const sendMock = jest.spyOn(provider, "send");
    (sendMock as any).mockResolvedValue(chainId);

    provider.websocket.onopen!({ type: "test", target: provider.websocket });

    await new Promise((resolve) => setTimeout(resolve, 5));

    Object.defineProperty(provider._websocket, "readyState", { value: 1 });

    const request = { id: 1, payload: "{}", callback: jest.fn() };
    provider._requests.push(request);
    const response = { id: request.id, error: "pouet" };

    provider.websocket.onmessage!({ type: "", data: JSON.stringify(response), target: provider.websocket });

    expect(provider._requests.length).toBe(0);
    expect(request.callback).toBeCalledWith(expect.any(Error), undefined);

    await provider.destroy();
  });

  it("should process subscription messages by calling callback", async () => {
    const provider = new AutoWebSocketProvider(URL, { chainId, providerIndex: 1, pingDelayMs: 1 });

    Object.defineProperty(provider._websocket, "readyState", { value: 0 });
    const sendMock = jest.spyOn(provider, "send");
    (sendMock as any).mockResolvedValue(chainId);

    provider.websocket.onopen!({ type: "test", target: provider.websocket });

    await new Promise((resolve) => setTimeout(resolve, 5));

    Object.defineProperty(provider._websocket, "readyState", { value: 1 });

    const subscription = { tag: "tag", processFunc: jest.fn() };
    provider._subIds[subscription.tag] = Promise.resolve(subscription.tag);
    provider._subs[subscription.tag] = subscription;
    const response = { method: "eth_subscription", params: { result: chainId, subscription: subscription.tag } };

    provider.websocket.onmessage!({ type: "", data: JSON.stringify(response), target: provider.websocket });

    expect(provider._requests.length).toBe(0);
    expect(subscription.processFunc).toBeCalledWith(response.params.result);

    await provider.destroy();
  });

  it("should handle rate limiting errors gracefully", async () => {
    const provider = new AutoWebSocketProvider(URL, { chainId, providerIndex: 1, pingDelayMs: 1, retryDelayMs: 1 });

    Object.defineProperty(provider._websocket, "readyState", { value: 0 });
    const sendMock = jest.spyOn(provider, "send");
    (sendMock as any).mockResolvedValue(chainId);

    provider.websocket.onopen!({ type: "test", target: provider.websocket });

    await new Promise((resolve) => setTimeout(resolve, 5));

    Object.defineProperty(provider._websocket, "readyState", { value: 1 });

    const request = { id: 1, payload: "{}", callback: jest.fn() };
    provider._requests.push(request);
    const response = { id: 0, error: { code: 429 } };

    expect(provider.websocket.send).not.toBeCalled();

    provider.websocket.onmessage!({
      type: "",
      data: JSON.stringify(response),
      target: provider.websocket,
    });

    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(provider._retryCount).toBe(1);
    expect(provider.websocket.send).toBeCalled();
    expect(request.callback).not.toBeCalled();

    await provider.destroy();
  });

  it("should put new requests in queue if there is already a pending one", async () => {
    const provider = new AutoWebSocketProvider(URL, { chainId, providerIndex: 1, pingDelayMs: 1 });

    Object.defineProperty(provider._websocket, "readyState", { value: 0 });

    // connecting websocket
    provider.websocket.onopen!({ type: "test", target: provider.websocket });
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(provider.websocket.send).toBeCalledTimes(1);

    Object.defineProperty(provider._websocket, "readyState", { value: 1 });

    // sending real request
    const sendPromise = provider.send("eth_method", ["param"]);

    // checking the queue state
    expect(provider._requests.length).toBe(2);
    expect(provider._requests[1].id).toBe(2);
    expect(provider._requests[1].payload).toBe('{"method":"eth_method","params":["param"],"id":2,"jsonrpc":"2.0"}');
    expect(provider.websocket.send).toBeCalledTimes(1);

    // calling our request callback as if it was sent and replied
    provider._requests[1].callback(undefined as unknown as Error, "result");

    const result = await sendPromise;
    expect(result).toBe("result");

    await provider.destroy();
  });

  it("should add new subscription to the queue and process messages coming from it", async () => {
    const provider = new AutoWebSocketProvider(URL, { chainId, providerIndex: 1, pingDelayMs: 1 });

    Object.defineProperty(provider._websocket, "readyState", { value: 0 });

    // connecting websocket
    provider.websocket.onopen!({ type: "test", target: provider.websocket });

    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(provider.websocket.send).toBeCalledTimes(1);
    expect(provider._requests.length).toBe(1);
    expect(provider._events.length).toBe(0);

    Object.defineProperty(provider._websocket, "readyState", { value: 1 });

    // resolving chainId request
    provider.websocket.onmessage!({
      type: "",
      target: provider.websocket,
      data: JSON.stringify({ id: provider._requests[0].id, result: chainId }),
    });
    expect(provider._requests.length).toBe(0);

    // subscription requests
    const onBlockMock = jest.fn();
    provider.on("block", onBlockMock);

    const onPendingMock = jest.fn();
    provider.on("pending", onPendingMock);

    const onFilterMock = jest.fn();
    provider.on([["0x0000000000000000000000000000000000000000000000000000000000000000"]], onFilterMock);

    const onTxMock = jest.fn();
    provider.on("0x0123456789012345678901234567890101234567890123456789012345678901", onTxMock);

    await new Promise((resolve) => setTimeout(resolve, 5));

    // checking event listeners
    expect(provider._events.length).toBe(4);
    expect(provider._events[0].tag).toBe("block");
    expect(provider._events[1].tag).toBe("pending");
    expect(provider._events[2].tag).toBe("filter:*:0x0000000000000000000000000000000000000000000000000000000000000000");
    expect(provider._events[3].tag).toBe("tx:0x0123456789012345678901234567890101234567890123456789012345678901");

    provider._events.forEach((event) => expect(event.listener).not.toBeCalled());

    expect(Object.keys(provider._subIds)).toEqual([
      "block",
      "pending",
      "filter:*:0x0000000000000000000000000000000000000000000000000000000000000000",
      "tx",
    ]);
    expect(Object.keys(provider._subs).length).toBe(0);
    expect(Object.keys(provider._subIds).length).toBe(4);
    expect(provider._requests.length).toBe(5);

    // sending subscription requests replies to get subIds
    const requests = [...provider._requests];
    for (let i = 0; i < requests.length; i++) {
      provider.websocket.onmessage!({
        type: "",
        target: provider.websocket,
        data: JSON.stringify({
          id: requests[i].id,
          result: requests[i].id,
        }),
      });
      await new Promise((resolve) => setTimeout(resolve, 1));
    }

    // waiting for promises to resolve
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(Object.keys(provider._subs).length).toBe(4);
    expect(provider._requests.length).toBe(0);

    expect(onBlockMock).not.toBeCalled();
    expect(onPendingMock).not.toBeCalled();
    expect(onTxMock).not.toBeCalled();
    expect(onFilterMock).not.toBeCalled();

    const getTxReceiptMock = jest.spyOn(provider, "getTransactionReceipt");
    getTxReceiptMock.mockResolvedValue("ok receipt" as any);

    // receiving new data on subscriptions
    const results: Record<string, any> = {
      "4": { number: "1234" }, // block reply
      "5": "ok pending", // pending reply
      "6": { hash: "0x11a563a5935c9f88f47ee8950b3f49d175964f2daccc91c3fa7ee86204b9ac91" }, // tx reply
      "7": {
        removed: null,
        blockNumber: null,
        blockHash: null,
        transactionIndex: 1,
        address: "0x95222290DD7278Aa3Ddd389Cc1E1d165CC4BAfe5",
        data: "0x",
        topics: ["0x11a563a5935c9f88f47ee8950b3f49d175964f2daccc91c3fa7ee86204b9ac91"],
        transactionHash: "0x11a563a5935c9f88f47ee8950b3f49d175964f2daccc91c3fa7ee86204b9ac91",
        logIndex: 2,
      }, // filter reply
    };

    Object.keys(provider._subs).forEach((subId) => {
      provider.websocket.onmessage!({
        type: "",
        target: provider.websocket,
        data: JSON.stringify({
          method: "eth_subscription",
          params: { subscription: subId, result: results[subId] },
        }),
      });
    });

    // waiting for promises to resolve
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(onBlockMock).toHaveBeenCalledWith(1234);
    expect(onPendingMock).toHaveBeenCalledWith("ok pending");
    expect(onTxMock).toHaveBeenCalledWith("ok receipt");
    expect(onFilterMock).toHaveBeenCalledWith({
      removed: false,
      transactionIndex: 1,
      address: "0x95222290DD7278Aa3Ddd389Cc1E1d165CC4BAfe5",
      data: "0x",
      topics: ["0x11a563a5935c9f88f47ee8950b3f49d175964f2daccc91c3fa7ee86204b9ac91"],
      transactionHash: "0x11a563a5935c9f88f47ee8950b3f49d175964f2daccc91c3fa7ee86204b9ac91",
      logIndex: 2,
    });

    await provider.destroy();
  });

  it("should unsubscribe event and remove subscription listener", async () => {
    const provider = new AutoWebSocketProvider(URL, { chainId, providerIndex: 1, pingDelayMs: 1 });

    Object.defineProperty(provider._websocket, "readyState", { value: 0 });

    // connecting websocket
    provider.websocket.onopen!({ type: "test", target: provider.websocket });

    await new Promise((resolve) => setTimeout(resolve, 5));

    Object.defineProperty(provider._websocket, "readyState", { value: 1 });

    expect(provider.websocket.send).toBeCalledTimes(1);
    expect(provider._requests.length).toBe(1);
    expect(provider._events.length).toBe(0);

    // resolving chainId request
    provider.websocket.onmessage!({
      type: "",
      target: provider.websocket,
      data: JSON.stringify({ id: provider._requests[0].id, result: chainId }),
    });
    expect(provider._requests.length).toBe(0);

    // subscription request
    const onBlockMock = jest.fn();
    provider.on("block", onBlockMock);

    await new Promise((resolve) => setTimeout(resolve, 5));

    // checking event listeners
    expect(provider._events.length).toBe(1);
    expect(provider._events[0].tag).toBe("block");

    // sending subscription requests replies to get subIds
    const requests = [...provider._requests];
    for (let i = 0; i < requests.length; i++) {
      provider.websocket.onmessage!({
        type: "",
        target: provider.websocket,
        data: JSON.stringify({
          id: requests[i].id,
          result: requests[i].id,
        }),
      });
      await new Promise((resolve) => setTimeout(resolve, 1));
    }

    // waiting for promises to resolve
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(Object.keys(provider._subIds).length).toBe(1);
    expect(Object.keys(provider._subs).length).toBe(1);
    expect(provider._events.length).toBe(1);
    expect(provider._requests.length).toBe(0);

    // unsubscribing
    const event = provider._events[0];
    provider.removeListener("block", event.listener);
    provider._stopEvent(event);

    // waiting for promises to resolve
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(Object.keys(provider._subIds).length).toBe(0);
    expect(Object.keys(provider._subs).length).toBe(0);
    expect(provider._events.length).toBe(0);
    expect(provider._requests.length).toBe(1);
    const payload = JSON.parse(provider._requests[0].payload);
    expect(payload).toMatchObject({ method: "eth_unsubscribe" });

    await provider.destroy();
  });

  it("should throw if trying to enable polling", async () => {
    const provider = new AutoWebSocketProvider(URL, { chainId, providerIndex: 1, pingDelayMs: 1 });

    expect(() => (provider.polling = false)).not.toThrow();
    expect(() => (provider.polling = true)).toThrowError("cannot set polling on AutoWebSocketProvider");

    await provider.destroy();
  });

  it("should wait till connected before disconnecting", async () => {
    const provider = new AutoWebSocketProvider(URL, { chainId, providerIndex: 1, pingDelayMs: 1 });

    // setting connecting status
    Object.defineProperty(provider._websocket, "readyState", { value: 0 });

    // effectively connecting to setup ping timers
    provider.websocket.onopen!({ type: "test", target: provider.websocket });
    await new Promise((resolve) => setTimeout(resolve, 5));

    // starting disconnection
    const disconnectPromise = provider.destroy();
    await new Promise((resolve) => setTimeout(resolve, 5));

    // resolving promise
    provider.websocket.onopen!({ type: "test", target: provider.websocket });

    await disconnectPromise;

    expect(provider.websocket.close).toBeCalled();
  });
});
