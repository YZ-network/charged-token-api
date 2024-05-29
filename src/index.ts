import mongoose from "mongoose";
import { configureApiServer } from "./api/server";
import { Broker } from "./broker";
import { ApiVersion, Config } from "./config";
import { DbRepository } from "./db/DbRepository";
import { WorkerManager } from "./manager";
import { rootLogger } from "./rootLogger";

const log = rootLogger.child({ name: "Main" });

export async function start() {
  const db = new DbRepository();
  const broker = new Broker();
  const workerManager = new WorkerManager(db, broker);
  const httpServer = configureApiServer(db, broker, workerManager);

  try {
    log.info({ msg: "Connecting to MongoDB", mongouri: Config.db.uri });
    mongoose.set("strictQuery", true);
    await mongoose.connect(Config.db.uri);
    log.info("MongoDB connected !");
  } catch (err) {
    log.error({ msg: "Error connecting to MongoDB !", err });
  }

  log.info({ msg: "Starting chain workers" });

  await workerManager.start();

  log.info({ msg: "Starting API", version: ApiVersion, config: Config });

  const bindAddress = Config.api.bindAddress;
  const bindPort = Config.api.bindPort;

  httpServer.listen(bindPort, bindAddress, () => {
    log.info({ msg: "GraphQL API server started", address: bindAddress, port: bindPort });
  });
}

start().catch((err) => log.error({ msg: "API server crashed", err }));
