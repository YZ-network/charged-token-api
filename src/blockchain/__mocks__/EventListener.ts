export const EventListener = jest.fn().mockImplementation(() => ({
  queueLog: jest.fn(),
  executePendingLogs: jest.fn(),
  destroy: jest.fn(),
}));
