import { Main } from "./main";
import { rootLogger } from "./rootLogger";

const log = rootLogger.child({ name: "index" });

Main.init();
Main.start().catch((err) => {
  log.error({ msg: "GraphQL API stopped with error", err });
});
