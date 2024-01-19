import createLogger from "pino";
import { Config } from "../globals";

export const rootLogger = createLogger({
  level: Config.api.logLevel,
});
