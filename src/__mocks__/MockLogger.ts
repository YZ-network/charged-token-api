import { Logger } from "pino";

export const MockLogger: jest.Mock<Logger> = jest.fn().mockImplementation(() => ({
  trace: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));
