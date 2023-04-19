import { Main } from "./main";
import { rootLogger } from "./util";

const log = rootLogger.child({ name: "index" });

Main.init();
Main.start()
  .then(() => log.info("GraphQL API stopped"))
  .catch((err) => log.error({ msg: "GraphQL API stopped with error", err }));
