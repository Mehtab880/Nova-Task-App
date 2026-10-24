import { createLogger, REDACTED, redact, type LogRecord } from './Logger';

function capture(): { records: LogRecord[]; sink: (record: LogRecord) => void } {
  const records: LogRecord[] = [];
  return { records, sink: record => records.push(record) };
}

const clock = { now: () => new Date('2026-10-24T12:00:00.000Z') };

describe('Logger', () => {
  it('filters records below the configured level', () => {
    const { records, sink } = capture();
    const logger = createLogger({ level: 'info', sink, clock });

    logger.debug('hidden');
    logger.info('shown');
    logger.warn('warning');
    logger.error('failure');

    expect(records.map(record => record.level)).toEqual(['info', 'warn', 'error']);
    expect(records[0]?.timestamp).toBe('2026-10-24T12:00:00.000Z');
  });

  it('suppresses everything at silent level', () => {
    const { records, sink } = capture();
    const logger = createLogger({ level: 'silent', sink, clock });
    logger.error('hidden');
    expect(records).toHaveLength(0);
  });

  it('redacts sensitive keys recursively', () => {
    const { records, sink } = capture();
    const logger = createLogger({ level: 'debug', sink, clock });

    logger.info('login', {
      password: 'hunter2',
      nested: { accessToken: 'abc123', safe: 'visible' },
      headers: { Authorization: 'Bearer abc.def.ghi' },
    });

    expect(records[0]?.context).toEqual({
      password: REDACTED,
      nested: { accessToken: REDACTED, safe: 'visible' },
      headers: { Authorization: REDACTED },
    });
  });

  it('redacts tokens and emails inside strings', () => {
    expect(
      redact({
        note: 'contact dev@example.com with Bearer abc.def.ghi',
        jwt: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.signature',
      }),
    ).toEqual({
      note: `contact ${REDACTED} with Bearer ${REDACTED}`,
      jwt: REDACTED,
    });
  });

  it('merges child bindings', () => {
    const { records, sink } = capture();
    const logger = createLogger({ level: 'info', sink, clock, bindings: { scope: 'root' } });
    logger.child({ scope: 'db', table: 'm0_spike' }).info('query');

    expect(records[0]?.context).toEqual({ scope: 'db', table: 'm0_spike' });
  });

  it('handles circular context safely', () => {
    const circular: Record<string, unknown> = { safe: true };
    circular['self'] = circular;

    expect(redact(circular)).toEqual({ safe: true, self: '[CIRCULAR]' });
  });
});
