import createLogger from 'pino';
import { Config } from '../config';

export const rootLogger = createLogger({
  level: Config.api.logLevel
});
