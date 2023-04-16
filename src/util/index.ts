import createLogger from "pino";

export const rootLogger = createLogger();

rootLogger.level = process.env.LOG_LEVEL || "warn";
