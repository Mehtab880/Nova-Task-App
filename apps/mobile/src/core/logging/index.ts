import { createLogger } from './Logger';
import { environment } from '../env/environment';

/** Application-wide logger. Redaction is applied before every sink call. */
export const logger = createLogger({
  level: environment.logLevel,
  bindings: { app: 'nova-task', environment: environment.name },
});

export { createLogger, redact, redactContext, REDACTED } from './Logger';
export type { LogContext, LogLevel, LogRecord, Logger, LogSink } from './Logger';
