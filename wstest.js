const WebSocket = require("ws");

const nodeUri =
  "wss://bsc.getblock.io/2477e5e7-ad87-4a45-9eff-f14f9447a7bc/mainnet/";

console.log("connecting to: %s", nodeUri);

const testPromise = new Promise((resolve, reject) => {
  const ws = new WebSocket(nodeUri);

  ws.on("close", (code, reason) => {
    console.warn(
      "websocket closed: code=%s reason=%s",
      code,
      reason.toString()
    );
    reject(reason.toString());
  });

  ws.on("error", (error) => {
    console.error(error);
    reject(error);
  });

  ws.on("open", function open() {
    console.log("connected, asking for chainId");
    ws.send(
      JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_chainId",
        params: [],
        id: 0,
      })
    );
  });

  ws.on("message", function message(data) {
    console.log("received: %s", data);
    ws.close();
    resolve();
  });
});

testPromise
  .then(() => console.log("test successful"))
  .catch((err) => console.error("test failed", err));
