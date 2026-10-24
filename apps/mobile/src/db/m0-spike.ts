import type { DB } from '@op-engineering/op-sqlite';
import { Platform } from 'react-native';

import { environment } from '@/core/env/environment';
import { logger } from '@/core/logging';

import { DATABASE_NAME, getNovaDrizzle, openNovaDatabase } from './client';
import { m0Spike } from './schema/m0-spike';
import { verifyIntlTimeZones } from './spike/intl-check';
import { verifyLuxonIanaTimeZones } from './spike/luxon-check';

export type SpikeCheckStatus = 'pass' | 'fail';

export interface SpikeCheckResult {
  readonly id: string;
  readonly title: string;
  readonly status: SpikeCheckStatus;
  readonly details: string;
  readonly durationMs: number;
}

export interface SpikeReport {
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly engine: string;
  readonly platform: string;
  readonly database: string;
  readonly databasePath: string;
  readonly sqliteVersion: string;
  readonly passed: number;
  readonly failed: number;
  readonly checks: readonly SpikeCheckResult[];
}

type CheckBody = () => Promise<string> | string;

async function runCheck(id: string, title: string, body: CheckBody): Promise<SpikeCheckResult> {
  const started = Date.now();
  try {
    const details = await body();
    return {
      id,
      title,
      status: 'pass',
      details,
      durationMs: Date.now() - started,
    };
  } catch (error) {
    return {
      id,
      title,
      status: 'fail',
      details: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - started,
    };
  }
}

function firstRowValue(result: Awaited<ReturnType<DB['execute']>>, column: string): unknown {
  return result.rows[0]?.[column];
}

function engineName(): string {
  return typeof HermesInternal !== 'undefined' && HermesInternal !== null ? 'hermes' : 'unknown';
}

/**
 * M0 SQLite spike. Creates only the throwaway `m0_spike` table; no product
 * tables, no migrations, no sync. Results are logged for docs/m0-spike-results.md.
 */
export async function runM0Spike(): Promise<SpikeReport> {
  if (!environment.m0SpikeEnabled) {
    throw new Error('The M0 spike is disabled for this environment');
  }

  const startedAt = new Date().toISOString();
  const checks: SpikeCheckResult[] = [];

  let db: DB | null = null;
  let databasePath = '';
  let sqliteVersion = 'unavailable';

  checks.push(
    await runCheck('open-database', 'Open nova.db', async () => {
      db = await openNovaDatabase();
      databasePath = db.getDbPath();
      const version = firstRowValue(
        await db.execute('SELECT sqlite_version() AS version'),
        'version',
      );
      sqliteVersion = String(version);
      return `sqlite ${sqliteVersion} at ${databasePath}`;
    }),
  );

  checks.push(
    await runCheck('foreign-keys', 'PRAGMA foreign_keys = ON', async () => {
      if (db === null) throw new Error('Database is not open');
      const value = firstRowValue(await db.execute('PRAGMA foreign_keys'), 'foreign_keys');
      if (Number(value) !== 1) throw new Error(`foreign_keys=${String(value)}`);
      return 'foreign_keys=1';
    }),
  );

  checks.push(
    await runCheck('wal', 'WAL journal mode', async () => {
      if (db === null) throw new Error('Database is not open');
      const value = firstRowValue(await db.execute('PRAGMA journal_mode'), 'journal_mode');
      if (String(value).toLowerCase() !== 'wal') throw new Error(`journal_mode=${String(value)}`);
      return 'journal_mode=wal';
    }),
  );

  checks.push(
    await runCheck('synchronous', 'PRAGMA synchronous = NORMAL', async () => {
      if (db === null) throw new Error('Database is not open');
      const value = firstRowValue(await db.execute('PRAGMA synchronous'), 'synchronous');
      if (Number(value) !== 1) throw new Error(`synchronous=${String(value)}`);
      return 'synchronous=NORMAL (1)';
    }),
  );

  checks.push(
    await runCheck('busy-timeout', 'PRAGMA busy_timeout = 5000', async () => {
      if (db === null) throw new Error('Database is not open');
      const value = firstRowValue(await db.execute('PRAGMA busy_timeout'), 'busy_timeout');
      if (Number(value) !== 5000) throw new Error(`busy_timeout=${String(value)}`);
      return 'busy_timeout=5000';
    }),
  );

  checks.push(
    await runCheck('drizzle-m0-spike', 'Drizzle insert/select on m0_spike', async () => {
      if (db === null) throw new Error('Database is not open');

      await db.execute('DROP TABLE IF EXISTS m0_spike');
      await db.execute(
        'CREATE TABLE m0_spike (id TEXT PRIMARY KEY NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL)',
      );

      const drizzleDb = getNovaDrizzle(db);
      await drizzleDb
        .insert(m0Spike)
        .values({
          id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
          payload: 'drizzle-ok',
          createdAt: new Date().toISOString(),
        })
        .run();

      const rows = await drizzleDb.select().from(m0Spike).all();
      const row = rows[0];
      if (rows.length !== 1 || row?.payload !== 'drizzle-ok') {
        throw new Error(`Unexpected drizzle rows: ${JSON.stringify(rows)}`);
      }

      return `drizzle read ${rows.length} row via op-sqlite`;
    }),
  );

  checks.push(
    await runCheck('fts5', 'FTS5 virtual table + MATCH', async () => {
      if (db === null) throw new Error('Database is not open');
      await db.execute('DROP TABLE IF EXISTS m0_spike_fts');
      try {
        await db.execute('CREATE VIRTUAL TABLE m0_spike_fts USING fts5(content)');
        await db.execute('INSERT INTO m0_spike_fts(content) VALUES (?)', ['nova task spike']);
        const result = await db.execute(
          'SELECT rowid FROM m0_spike_fts WHERE m0_spike_fts MATCH ?',
          ['nova'],
        );
        if (result.rows.length !== 1) {
          throw new Error(`FTS5 MATCH returned ${result.rows.length} rows`);
        }
        return 'FTS5 MATCH returned 1 row';
      } finally {
        await db.execute('DROP TABLE IF EXISTS m0_spike_fts');
      }
    }),
  );

  checks.push(
    await runCheck('json1', 'JSON1 json_extract/json_valid', async () => {
      if (db === null) throw new Error('Database is not open');
      const result = await db.execute(
        "SELECT json_extract(?, '$.ok') AS ok, json_valid(?) AS valid",
        ['{"ok":1}', '{"ok":1}'],
      );
      const row = result.rows[0];
      if (Number(row?.['ok']) !== 1 || Number(row?.['valid']) !== 1) {
        throw new Error(`Unexpected JSON1 result: ${JSON.stringify(row)}`);
      }
      return 'json_extract=1, json_valid=1';
    }),
  );

  checks.push(
    await runCheck('luxon-iana', 'Luxon IANA zones and DST', () => verifyLuxonIanaTimeZones()),
  );

  checks.push(
    await runCheck('hermes-intl', 'Hermes Intl IANA time zones', () => verifyIntlTimeZones()),
  );

  const finishedAt = new Date().toISOString();
  const failed = checks.filter(check => check.status === 'fail').length;

  const report: SpikeReport = {
    startedAt,
    finishedAt,
    engine: engineName(),
    platform: `android ${String(Platform.Version)}`,
    database: DATABASE_NAME,
    databasePath,
    sqliteVersion,
    passed: checks.length - failed,
    failed,
    checks,
  };

  logger.info('M0 SQLite spike complete', {
    passed: report.passed,
    failed: report.failed,
    engine: report.engine,
  });

  if (failed > 0) {
    logger.error('M0 SQLite spike failures', { report: JSON.stringify(report) });
  } else {
    logger.info('M0 SQLite spike report', { report: JSON.stringify(report) });
  }

  return report;
}
