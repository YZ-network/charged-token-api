import { EMPTY_ADDRESS } from "./types";

interface Config {
  rpcUrl: string[];
  directoryAddress: string[];
  mongodbHost: string;
  bindAddress: string;
  bindPort: number;
  corsOrigins: string;
  logLevel: string;
  enableGraphiQL: boolean;
  workerRestartDelayMs: number;
  rpcMaxParallelRequests: number;
  rpcMaxRetryCount: number;
  rpcPingDelayMs: number;
  rpcPongMaxWaitMs: number;
  rpcRetryDelayMs: number;
}

export const Config = {
  rpcUrl: (process.env.JSON_RPC_URL || "ws://127.0.0.1:7545").split(","),
  directoryAddress: (process.env.DIRECTORY_ADDRESS || EMPTY_ADDRESS).split(","),
  mongodbHost: process.env.MONGODB_HOST || "localhost",
  bindAddress: process.env.BIND_ADDRESS || "127.0.0.1",
  bindPort: Number(process.env.BIND_PORT || 4000),
  corsOrigins: process.env.CORS_ORIGINS || "http://localhost:3000",
  logLevel: process.env.LOG_LEVEL || "info",
  enableGraphiQL: process.env.ENABLE_GRAPHIQL === "true",
  workerRestartDelayMs: Number(process.env.WORKER_RESTART_DELAY_MS || 3000),
  rpcMaxParallelRequests: Number(process.env.RPC_MAX_PARALLEL || 4),
  rpcMaxRetryCount: Number(process.env.RPC_MAX_RETRIES || 3),
  rpcPingDelayMs: Number(process.env.RPC_PING_DELAY_MS || 3000),
  rpcPongMaxWaitMs: Number(process.env.RPC_PONG_TIMEOUT || 6000),
  rpcRetryDelayMs: Number(process.env.RPC_RETRY_DELAY_MS || 10),
};
