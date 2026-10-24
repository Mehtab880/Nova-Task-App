export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

export type ActiveLogLevel = Exclude<LogLevel, 'silent'>;

export type LogContext = Readonly<Record<string, unknown>>;

export interface LogRecord {
  readonly level: ActiveLogLevel;
  readonly message: string;
  /** ISO-8601 timestamp from the injected clock. */
  readonly timestamp: string;
  readonly context: LogContext;
}

export type LogSink = (record: LogRecord) => void;

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

const SENSITIVE_KEY = /pass(word)?|secret|token|auth|api[-_]?key|cookie|session|email|phone|ssn/i;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]+\b/gi;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

export const REDACTED = '[REDACTED]';

export function redactString(value: string): string {
  return value
    .replace(JWT_PATTERN, REDACTED)
    .replace(BEARER_PATTERN, `Bearer ${REDACTED}`)
    .replace(EMAIL_PATTERN, REDACTED);
}

function redactValue(value: unknown, seen: WeakSet<object>, depth: number): unknown {
  if (depth > 6) {
    return '[MAX_DEPTH]';
  }

  if (typeof value === 'string') {
    return redactString(value);
  }

  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (seen.has(value)) {
    return '[CIRCULAR]';
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map(item => redactValue(item, seen, depth + 1));
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message),
    };
  }

  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    output[key] = SENSITIVE_KEY.test(key) ? REDACTED : redactValue(child, seen, depth + 1);
  }
  return output;
}

/** Deep-redacts secrets, tokens, emails, and phone numbers from log context. */
export function redact(value: unknown): unknown {
  return redactValue(value, new WeakSet<object>(), 0);
}

export function redactContext(context: LogContext): LogContext {
  const redacted = redact(context);
  return redacted !== null && typeof redacted === 'object' && !Array.isArray(redacted)
    ? (redacted as LogContext)
    : {};
}

/* eslint-disable no-console */
export const consoleLogSink: LogSink = record => {
  const output = `[${record.timestamp}] ${record.level.toUpperCase()} ${record.message}`;

  switch (record.level) {
    case 'debug':
      console.debug(output, record.context);
      break;
    case 'info':
      console.info(output, record.context);
      break;
    case 'warn':
      console.warn(output, record.context);
      break;
    case 'error':
      console.error(output, record.context);
      break;
  }
};
/* eslint-enable no-console */

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  child(bindings: LogContext): Logger;
}

export interface LoggerOptions {
  readonly level: LogLevel;
  readonly sink?: LogSink;
  readonly clock?: { now(): Date };
  readonly bindings?: LogContext;
}

export function createLogger(options: LoggerOptions): Logger {
  const threshold = LEVEL_WEIGHT[options.level];
  const sink = options.sink ?? consoleLogSink;
  const clock = options.clock ?? { now: () => new Date() };
  const bindings = options.bindings ?? {};
  const safeBindings = redactContext(bindings);

  const log = (level: ActiveLogLevel, message: string, context?: LogContext): void => {
    if (LEVEL_WEIGHT[level] < threshold) {
      return;
    }

    const mergedContext = context === undefined ? safeBindings : { ...safeBindings, ...context };

    sink({
      level,
      message: redactString(message),
      timestamp: clock.now().toISOString(),
      context: redactContext(mergedContext),
    });
  };

  return {
    debug: (message, context) => log('debug', message, context),
    info: (message, context) => log('info', message, context),
    warn: (message, context) => log('warn', message, context),
    error: (message, context) => log('error', message, context),
    child: childBindings =>
      createLogger({
        ...options,
        bindings: { ...bindings, ...childBindings },
      }),
  };
}
