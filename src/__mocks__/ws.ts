export const WebSocketServer = jest.fn().mockImplementation(() => {
  return {
    makeServer: jest.fn(() => ({ handleProtocols: [] })),
  };
});

export const WebSocket = jest.fn().mockImplementation(() => {
  return {
    on: jest.fn(),
    off: jest.fn(),
    close: jest.fn(),
    terminate: jest.fn(),
    send: jest.fn(),
    ping: jest.fn(),
    readyState: jest.fn(),
  };
});

Object.defineProperty(WebSocket, "CONNECTING", { value: 0 });
Object.defineProperty(WebSocket, "OPEN", { value: 1 });
Object.defineProperty(WebSocket, "CLOSING", { value: 2 });
Object.defineProperty(WebSocket, "CLOSED", { value: 3 });
