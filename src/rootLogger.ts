import pino from "pino";
import { Config } from "./config";

export const rootLogger = pino({
  level: Config.api.logLevel,
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label, number) => ({ level: label }),
  },
});
