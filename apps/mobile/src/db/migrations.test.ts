import type { DB } from '@op-engineering/op-sqlite';
import { DatabaseSync } from 'node:sqlite';

import { M5_SCHEMA_VERSION, M5_TABLE_NAMES, MIGRATIONS, migrateDatabase } from './migrations';

const NOW = Date.UTC(2026, 2, 1, 12, 0);

const V1_SCHEDULE_COLUMNS = [
  'id',
  'reminder_id',
  'task_id',
  'occurrence_id',
  'dedupe_key',
  'local_date',
  'local_time',
  'timezone',
  'scheduled_at',
  'snoozed_until',
  'request_code',
  'is_exact_requested',
  'state',
  'reason',
  'status',
  'last_fired_at',
  'created_at',
  'updated_at',
] as const;

const DELIVERY_COLUMNS = ['trigger_seq', 'delivered_seq', 'dismissed_seq', 'dismissed_at'] as const;

interface TestDatabase {
  readonly db: DB;
  readonly raw: DatabaseSync;
}

interface ScheduleFixture {
  readonly id: string;
  readonly requestCode: number;
  readonly dedupeKey?: string;
  readonly state?: string;
  readonly status?: string;
  readonly lastFiredAt?: number | null;
}

function openDatabase(): TestDatabase {
  const raw = new DatabaseSync(':memory:');
  raw.exec('PRAGMA foreign_keys = ON');

  const execute = (
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<{
    rows: Record<string, unknown>[];
    rowsAffected: number;
    insertId: number;
  }> => {
    const statement = raw.prepare(sql);
    if (statement.columns().length > 0) {
      return Promise.resolve({ rows: statement.all(...params), rowsAffected: 0, insertId: 0 });
    }
    const info = statement.run(...params);
    return Promise.resolve({
      rows: [],
      rowsAffected: Number(info.changes),
      insertId: Number(info.lastInsertRowid),
    });
  };

  const transaction = async <T>(
    fn: (tx: { execute: typeof execute }) => Promise<T>,
  ): Promise<T> => {
    raw.exec('BEGIN');
    try {
      const result = await fn({ execute });
      raw.exec('COMMIT');
      return result;
    } catch (error) {
      raw.exec('ROLLBACK');
      throw error;
    }
  };

  return { raw, db: { execute, transaction } as unknown as DB };
}

function seedParents(raw: DatabaseSync): void {
  raw
    .prepare(
      `INSERT INTO "list"
        (id, name, color, is_default, sort_order, archived_at, created_at, updated_at)
       VALUES ('list_1', 'Inbox', NULL, 1, 0, NULL, ?, ?)`,
    )
    .run(NOW, NOW);
  raw
    .prepare(`INSERT INTO task (id, list_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`)
    .run('task_1', 'list_1', 'Plan the week', NOW, NOW);
  raw
    .prepare(`INSERT INTO reminder (id, task_id, created_at, updated_at) VALUES (?, ?, ?, ?)`)
    .run('reminder_1', 'task_1', NOW, NOW);
}

function insertSchedule(raw: DatabaseSync, fixture: ScheduleFixture): void {
  raw
    .prepare(
      `INSERT INTO notification_schedule
        (id, reminder_id, task_id, occurrence_id, dedupe_key, local_date, local_time,
         timezone, scheduled_at, snoozed_until, request_code, is_exact_requested,
         state, reason, status, last_fired_at, created_at, updated_at)
       VALUES (?, 'reminder_1', 'task_1', NULL, ?, '2026-03-01', '09:00', 'UTC', ?, NULL,
         ?, 1, ?, NULL, ?, ?, ?, ?)`,
    )
    .run(
      fixture.id,
      fixture.dedupeKey ?? fixture.id,
      NOW + 60_000,
      fixture.requestCode,
      fixture.state ?? 'exact',
      fixture.status ?? 'scheduled',
      fixture.lastFiredAt ?? null,
      NOW,
      NOW,
    );
}

function createV1Database(schedules: readonly ScheduleFixture[] = []): TestDatabase {
  const database = openDatabase();
  const v1 = MIGRATIONS.find(migration => migration.version === 1);
  if (v1 === undefined) throw new Error('v1 migration is missing');

  database.raw.exec('BEGIN');
  for (const statement of v1.statements) {
    database.raw.exec(statement);
  }
  database.raw.exec('PRAGMA user_version = 1');
  database.raw.exec('COMMIT');

  seedParents(database.raw);
  for (const schedule of schedules) {
    insertSchedule(database.raw, schedule);
  }
  return database;
}

function columnsOf(raw: DatabaseSync, table: string): string[] {
  return raw
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .map(row => String(row['name']));
}

function readSchedules(raw: DatabaseSync): Record<string, unknown>[] {
  return raw.prepare('SELECT * FROM notification_schedule ORDER BY id').all();
}

function schedulesById(raw: DatabaseSync): Map<string, Record<string, unknown>> {
  return new Map(readSchedules(raw).map(row => [String(row['id']), row]));
}

describe('M5 schema migrations', () => {
  it('creates the full schema and safe delivery defaults on a fresh install', async () => {
    const { db, raw } = openDatabase();

    const report = await migrateDatabase(db);

    expect(report).toEqual({
      fromVersion: 0,
      toVersion: M5_SCHEMA_VERSION,
      applied: [1, 2],
      legacyReminderRows: 0,
    });
    expect(raw.prepare('PRAGMA user_version').get()).toEqual({ user_version: 2 });

    const tables = raw
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`)
      .all()
      .map(row => String(row['name']));
    expect(tables).toEqual(expect.arrayContaining([...M5_TABLE_NAMES]));
    expect(columnsOf(raw, 'notification_schedule')).toEqual(
      expect.arrayContaining([...V1_SCHEDULE_COLUMNS, ...DELIVERY_COLUMNS]),
    );

    seedParents(raw);
    insertSchedule(raw, { id: 'schedule_fresh', requestCode: 101 });
    expect(schedulesById(raw).get('schedule_fresh')).toMatchObject({
      trigger_seq: 1,
      delivered_seq: 0,
      dismissed_seq: 0,
      dismissed_at: null,
    });
  });

  it('upgrades an existing v1 database additively without touching v1 data', async () => {
    const { db, raw } = createV1Database([
      { id: 'schedule_pending', requestCode: 101 },
      { id: 'schedule_fired', requestCode: 102, status: 'fired', lastFiredAt: NOW - 5_000 },
    ]);
    const beforeColumns = columnsOf(raw, 'notification_schedule');
    expect(beforeColumns).toEqual([...V1_SCHEDULE_COLUMNS]);
    expect(beforeColumns).not.toContain('trigger_seq');

    const report = await migrateDatabase(db);

    expect(report).toEqual({
      fromVersion: 1,
      toVersion: 2,
      applied: [2],
      legacyReminderRows: 0,
    });
    expect(raw.prepare('PRAGMA user_version').get()).toEqual({ user_version: 2 });
    expect(columnsOf(raw, 'notification_schedule')).toEqual([
      ...V1_SCHEDULE_COLUMNS,
      ...DELIVERY_COLUMNS,
    ]);
    expect(readSchedules(raw)).toHaveLength(2);
    expect(schedulesById(raw).get('schedule_fired')).toMatchObject({
      status: 'fired',
      last_fired_at: NOW - 5_000,
      delivered_seq: 1,
    });

    const indexes = raw
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'index'`)
      .all()
      .map(row => String(row['name']));
    expect(indexes).toContain('idx_schedule_status_time');

    // The upgrade is additive: only columns and a one-way backfill.
    const v2 = MIGRATIONS.find(migration => migration.version === 2);
    expect(v2?.statements.every(statement => /^\s*(ALTER TABLE|UPDATE)\b/i.test(statement))).toBe(
      true,
    );
  });

  it('backfills every already-delivered record so it cannot re-alert', async () => {
    const { db, raw } = createV1Database([
      { id: 'schedule_fired_at', requestCode: 101, lastFiredAt: NOW - 60_000 },
      { id: 'schedule_delivered_active', requestCode: 102, state: 'delivered-active' },
      { id: 'schedule_status_fired', requestCode: 103, status: 'fired' },
    ]);

    await migrateDatabase(db);

    const rows = schedulesById(raw);
    for (const id of ['schedule_fired_at', 'schedule_delivered_active', 'schedule_status_fired']) {
      expect(rows.get(id)).toMatchObject({
        trigger_seq: 1,
        delivered_seq: 1,
        dismissed_seq: 0,
        dismissed_at: null,
      });
    }
  });

  it('leaves pending records undelivered after the upgrade', async () => {
    const { db, raw } = createV1Database([
      { id: 'schedule_scheduled', requestCode: 101, state: 'exact' },
      { id: 'schedule_deferred', requestCode: 102, state: 'deferred-cap' },
      { id: 'schedule_overdue', requestCode: 103, state: 'inexact-overdue' },
    ]);

    await migrateDatabase(db);

    const rows = schedulesById(raw);
    for (const id of ['schedule_scheduled', 'schedule_deferred', 'schedule_overdue']) {
      expect(rows.get(id)).toMatchObject({
        trigger_seq: 1,
        delivered_seq: 0,
        dismissed_seq: 0,
        dismissed_at: null,
      });
    }
  });

  it('reopening an already-upgraded database is a no-op', async () => {
    const { db, raw } = createV1Database([
      { id: 'schedule_delivered', requestCode: 101, status: 'fired', lastFiredAt: NOW - 60_000 },
    ]);
    await migrateDatabase(db);
    raw
      .prepare(`UPDATE notification_schedule SET dismissed_seq = 1, dismissed_at = ? WHERE id = ?`)
      .run(NOW, 'schedule_delivered');

    const report = await migrateDatabase(db);

    expect(report).toEqual({
      fromVersion: 2,
      toVersion: 2,
      applied: [],
      legacyReminderRows: 0,
    });
    expect(raw.prepare('PRAGMA user_version').get()).toEqual({ user_version: 2 });
    expect(schedulesById(raw).get('schedule_delivered')).toMatchObject({
      trigger_seq: 1,
      delivered_seq: 1,
      dismissed_seq: 1,
      dismissed_at: NOW,
    });
  });
});
