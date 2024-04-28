const configDefaults: JsonConfig = {
  db: {
    uri: "mongodb://127.0.0.1:27017/test?replicaSet=rs0",
  },
  api: {
    bindAddress: "127.0.0.1",
    bindPort: 4000,
    corsOrigins: "http://localhost:3000",
    logLevel: "error",
    enableGraphiql: true,
  },
  networks: [
    {
      chainId: 1337,
      uri: "ws://127.0.0.1:8545",
      directory: "0xA8CA002BF4d8253b8493b1c92Fd3055F05A2DF6B",
      enabled: true,
    },
  ],
  delays: {
    healthPublishDelayMs: 3000,
    workerRestartDelayMs: 30000,
    rpcMaxParallelRequests: 4,
    rpcMaxRetryCount: 3,
    rpcPingDelayMs: 3000,
    rpcPongMaxWaitMs: 6000,
    rpcRetryDelayMs: 1000,
    nodeDownAlertDelayMs: 10000,
  },
  blocks: {
    lag: 3,
    buffer: 2,
  },
};

export const ApiVersion = process.env.API_VERSION !== undefined ? process.env.API_VERSION : "dev";

export const Config: JsonConfig =
  process.env.CONFIG !== undefined ? { ...configDefaults, ...JSON.parse(process.env.CONFIG) } : configDefaults;
