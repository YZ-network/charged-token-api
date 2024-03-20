export const AutoWebSocketProvider = jest.fn().mockImplementation(() => {
  const handlers: Record<string, any> = {};
  return {
    handlers,
    websocket: {
      readyState: 1,
    },
    on: jest.fn((event, handler) => {
      handlers[event] = handler;
    }),
    ready: new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          name: "test",
          chainId: 1337,
        });
      }, 100);
    }),
    getBlockNumber: jest.fn(),
    removeAllListeners: jest.fn(),
    destroy: jest.fn(),
  };
});
