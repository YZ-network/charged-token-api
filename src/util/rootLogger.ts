import createLogger from "pino";

export const rootLogger = createLogger({
  level: process.env.LOG_LEVEL || "warn",
});
