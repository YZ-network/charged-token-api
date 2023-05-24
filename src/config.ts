interface JsonDbConfig {
  uri: string;
}

interface JsonApiConfig {
  bindAddress: string;
  bindPort: number;
  corsOrigins: string;
  logLevel: string;
  enableGraphiql: boolean;
}

interface JsonNetworkConfig {
  chainId: number;
  uri: string;
  directory: string;
}

interface JsonDelaysConfig {
  workerRestartDelayMs: number;
  rpcMaxParallelRequests: number;
  rpcMaxRetryCount: number;
  rpcPingDelayMs: number;
  rpcPongMaxWaitMs: number;
  rpcRetryDelayMs: number;
}

interface JsonConfig {
  db: JsonDbConfig;
  api: JsonApiConfig;
  networks: JsonNetworkConfig[];
  delays: JsonDelaysConfig;
}

const configDefaults: JsonConfig = {
  db: {
    uri: "mongodb://127.0.0.1:27017/test?replicaSet=rs0",
  },
  api: {
    bindAddress: "127.0.0.1",
    bindPort: 4000,
    corsOrigins: "http://localhost:3000",
    logLevel: "info",
    enableGraphiql: true,
  },
  networks: [],
  delays: {
    workerRestartDelayMs: 3000,
    rpcMaxParallelRequests: 4,
    rpcMaxRetryCount: 3,
    rpcPingDelayMs: 3000,
    rpcPongMaxWaitMs: 6000,
    rpcRetryDelayMs: 10,
  },
};

export const Config: JsonConfig = process.env.CONFIG
  ? { ...configDefaults, ...JSON.parse(process.env.CONFIG) }
  : configDefaults;
