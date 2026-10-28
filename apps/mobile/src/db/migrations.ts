import type { DB } from '@op-engineering/op-sqlite';

import { systemClock } from '@/core/time/Clock';

/**
 * M5 canonical schema. SQLite is the source of truth for tasks, recurrence, and
 * reminder definitions; notification_schedule is the projection that is handed
 * to the native AlarmManager cache.
 *
 * Migration policy: append a new entry. Never edit a shipped migration.
 */
export const M5_SCHEMA_VERSION = 2;

export const DEFAULT_LIST_ID = 'list_00000000000000000000000000';

export const M5_TABLE_NAMES = [
  'task',
  'subtask',
  'list',
  'tag',
  'task_tag',
  'reminder',
  'recurrence_rule',
  'recurrence_occurrence',
  'notification_schedule',
  'reminder_event',
  'completed_history',
  'deleted_tombstone',
  'settings',
  'draft_state',
] as const;

export type M5TableName = (typeof M5_TABLE_NAMES)[number];

const CREATE_TABLES_SQL = [
  `CREATE TABLE IF NOT EXISTS "list" (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    color TEXT,
    is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
    sort_order INTEGER NOT NULL DEFAULT 0,
    archived_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS task (
    id TEXT PRIMARY KEY NOT NULL,
    list_id TEXT NOT NULL REFERENCES "list"(id) ON DELETE RESTRICT,
    series_id TEXT REFERENCES task(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'todo'
      CHECK (status IN ('todo', 'in_progress', 'done', 'cancelled')),
    priority TEXT NOT NULL DEFAULT 'none'
      CHECK (priority IN ('none', 'low', 'medium', 'high', 'urgent')),
    due_date TEXT,
    due_time TEXT,
    due_at INTEGER,
    is_all_day INTEGER NOT NULL DEFAULT 1 CHECK (is_all_day IN (0, 1)),
    occurrence_date TEXT,
    is_recurrence_template INTEGER NOT NULL DEFAULT 0
      CHECK (is_recurrence_template IN (0, 1)),
    sort_order INTEGER NOT NULL DEFAULT 0,
    completed_at INTEGER,
    archived_at INTEGER,
    deleted_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS subtask (
    id TEXT PRIMARY KEY NOT NULL,
    task_id TEXT NOT NULL REFERENCES task(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    is_completed INTEGER NOT NULL DEFAULT 0 CHECK (is_completed IN (0, 1)),
    sort_order INTEGER NOT NULL DEFAULT 0,
    deleted_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS tag (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL UNIQUE,
    color TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS task_tag (
    task_id TEXT NOT NULL REFERENCES task(id) ON DELETE CASCADE,
    tag_id TEXT NOT NULL REFERENCES tag(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (task_id, tag_id)
  )`,
  `CREATE TABLE IF NOT EXISTS reminder (
    id TEXT PRIMARY KEY NOT NULL,
    task_id TEXT NOT NULL REFERENCES task(id) ON DELETE CASCADE,
    label TEXT NOT NULL DEFAULT '',
    kind TEXT NOT NULL DEFAULT 'relative'
      CHECK (kind IN ('relative', 'absolute')),
    offset_minutes INTEGER NOT NULL DEFAULT 0,
    local_date TEXT,
    local_time TEXT,
    is_exact INTEGER NOT NULL DEFAULT 1 CHECK (is_exact IN (0, 1)),
    status TEXT NOT NULL DEFAULT 'scheduled'
      CHECK (status IN ('scheduled', 'completed', 'cancelled')),
    snooze_until INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS recurrence_rule (
    id TEXT PRIMARY KEY NOT NULL,
    task_id TEXT NOT NULL UNIQUE REFERENCES task(id) ON DELETE CASCADE,
    frequency TEXT NOT NULL
      CHECK (frequency IN ('daily', 'weekdays', 'weekly', 'monthly', 'yearly')),
    interval INTEGER NOT NULL DEFAULT 1 CHECK (interval >= 1),
    weekdays TEXT NOT NULL DEFAULT '',
    monthly_mode TEXT NOT NULL DEFAULT 'day_of_month'
      CHECK (monthly_mode IN ('day_of_month', 'nth_weekday')),
    month_day INTEGER,
    nth INTEGER,
    weekday INTEGER,
    start_date TEXT NOT NULL,
    start_time TEXT,
    timezone TEXT NOT NULL,
    end_date TEXT,
    end_after_count INTEGER CHECK (end_after_count IS NULL OR end_after_count >= 1),
    completed_count INTEGER NOT NULL DEFAULT 0,
    repeat_after_completion INTEGER NOT NULL DEFAULT 0
      CHECK (repeat_after_completion IN (0, 1)),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS recurrence_occurrence (
    id TEXT PRIMARY KEY NOT NULL,
    rule_id TEXT NOT NULL REFERENCES recurrence_rule(id) ON DELETE CASCADE,
    task_id TEXT NOT NULL UNIQUE REFERENCES task(id) ON DELETE CASCADE,
    occurrence_date TEXT NOT NULL,
    occurrence_time TEXT,
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending', 'completed', 'skipped', 'cancelled')),
    is_exception INTEGER NOT NULL DEFAULT 0 CHECK (is_exception IN (0, 1)),
    scheduled_at INTEGER,
    completed_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE (rule_id, occurrence_date)
  )`,
  `CREATE TABLE IF NOT EXISTS notification_schedule (
    id TEXT PRIMARY KEY NOT NULL,
    reminder_id TEXT NOT NULL REFERENCES reminder(id) ON DELETE CASCADE,
    task_id TEXT NOT NULL REFERENCES task(id) ON DELETE CASCADE,
    occurrence_id TEXT REFERENCES recurrence_occurrence(id) ON DELETE CASCADE,
    dedupe_key TEXT NOT NULL UNIQUE,
    local_date TEXT NOT NULL,
    local_time TEXT NOT NULL,
    timezone TEXT NOT NULL,
    scheduled_at INTEGER NOT NULL,
    snoozed_until INTEGER,
    request_code INTEGER NOT NULL UNIQUE,
    is_exact_requested INTEGER NOT NULL DEFAULT 1
      CHECK (is_exact_requested IN (0, 1)),
    state TEXT NOT NULL DEFAULT 'pending',
    reason TEXT,
    status TEXT NOT NULL DEFAULT 'scheduled'
      CHECK (status IN ('scheduled', 'fired', 'completed', 'cancelled')),
    last_fired_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS reminder_event (
    id TEXT PRIMARY KEY NOT NULL,
    reminder_id TEXT,
    schedule_id TEXT,
    task_id TEXT,
    occurrence_id TEXT,
    type TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS completed_history (
    id TEXT PRIMARY KEY NOT NULL,
    task_id TEXT NOT NULL,
    task_title TEXT NOT NULL,
    occurrence_id TEXT,
    completed_at INTEGER NOT NULL,
    previous_status TEXT NOT NULL,
    previous_completed_at INTEGER,
    undo_token TEXT NOT NULL UNIQUE,
    undone_at INTEGER,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS deleted_tombstone (
    id TEXT PRIMARY KEY NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    payload TEXT NOT NULL,
    deleted_at INTEGER NOT NULL,
    undo_expires_at INTEGER,
    undone_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS draft_state (
    id TEXT PRIMARY KEY NOT NULL,
    payload TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
] as const;

const CREATE_INDEXES_SQL = [
  `CREATE INDEX IF NOT EXISTS idx_task_list_status_due
    ON task (list_id, status, due_date) WHERE deleted_at IS NULL`,
  `CREATE INDEX IF NOT EXISTS idx_task_series_occurrence
    ON task (series_id, occurrence_date)`,
  `CREATE INDEX IF NOT EXISTS idx_task_active_due
    ON task (status, due_at) WHERE deleted_at IS NULL`,
  `CREATE INDEX IF NOT EXISTS idx_subtask_task
    ON subtask (task_id, sort_order) WHERE deleted_at IS NULL`,
  `CREATE INDEX IF NOT EXISTS idx_reminder_task_status
    ON reminder (task_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_occurrence_rule_date
    ON recurrence_occurrence (rule_id, occurrence_date, status)`,
  `CREATE INDEX IF NOT EXISTS idx_schedule_reminder_time
    ON notification_schedule (reminder_id, scheduled_at)`,
  `CREATE INDEX IF NOT EXISTS idx_schedule_status_time
    ON notification_schedule (status, scheduled_at)`,
  `CREATE INDEX IF NOT EXISTS idx_completed_history_task
    ON completed_history (task_id, completed_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_tombstone_entity
    ON deleted_tombstone (entity_type, deleted_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_reminder_event_task
    ON reminder_event (task_id, created_at DESC)`,
] as const;

export interface Migration {
  readonly version: number;
  readonly statements: readonly string[];
}

/**
 * F2: a logical trigger (one notification_schedule row) can have several
 * delivery attempts. `trigger_seq` identifies the current attempt and is
 * incremented only by an explicit snooze; `delivered_seq` records the attempt
 * that was actually posted. Dismissal is tracked separately so it can never be
 * used as a scheduling input. Additive only: no table rebuild, no data loss.
 */
const ADD_DELIVERY_STATE_SQL = [
  `ALTER TABLE notification_schedule ADD COLUMN trigger_seq INTEGER NOT NULL DEFAULT 1`,
  `ALTER TABLE notification_schedule ADD COLUMN delivered_seq INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE notification_schedule ADD COLUMN dismissed_seq INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE notification_schedule ADD COLUMN dismissed_at INTEGER`,
  // Rows delivered before this build must not re-alert after the upgrade.
  `UPDATE notification_schedule
      SET delivered_seq = trigger_seq
    WHERE last_fired_at IS NOT NULL
       OR state = 'delivered-active'
       OR status = 'fired'`,
] as const;

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    statements: [...CREATE_TABLES_SQL, ...CREATE_INDEXES_SQL],
  },
  {
    version: 2,
    statements: [...ADD_DELIVERY_STATE_SQL],
  },
];

export interface MigrationReport {
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly applied: readonly number[];
  readonly legacyReminderRows: number;
}

interface ScalarResult {
  readonly rows: readonly Readonly<Record<string, unknown>>[];
}

function scalar(result: ScalarResult, column: string): unknown {
  return result.rows[0]?.[column];
}

async function readUserVersion(db: DB): Promise<number> {
  const result = await db.execute('PRAGMA user_version');
  const value = scalar(result, 'user_version');
  return typeof value === 'number' && Number.isInteger(value) ? value : 0;
}

async function countLegacyReminders(db: DB): Promise<number> {
  try {
    const result = await db.execute(
      `SELECT COUNT(*) AS count FROM sqlite_master
       WHERE type = 'table' AND name = 'task_reminders'`,
    );
    if (Number(scalar(result, 'count')) === 0) return 0;
    const rows = await db.execute('SELECT COUNT(*) AS count FROM task_reminders');
    const value = scalar(rows, 'count');
    return typeof value === 'number' ? value : 0;
  } catch {
    return 0;
  }
}

/**
 * Applies all pending migrations in one transaction per version. The legacy M4
 * `task_reminders` table is intentionally left intact: it is a dev fixture and
 * the first M5 native reconcile cancels its alarms by replacing the whole cache.
 */
export async function migrateDatabase(db: DB): Promise<MigrationReport> {
  const fromVersion = await readUserVersion(db);
  const applied: number[] = [];
  const pending = MIGRATIONS.filter(migration => migration.version > fromVersion).sort(
    (left, right) => left.version - right.version,
  );

  for (const migration of pending) {
    await db.transaction(async tx => {
      for (const statement of migration.statements) {
        await tx.execute(statement);
      }
      await tx.execute(`PRAGMA user_version = ${String(migration.version)}`);
    });
    applied.push(migration.version);
  }

  const legacyReminderRows = await countLegacyReminders(db);
  return {
    fromVersion,
    toVersion: pending.at(-1)?.version ?? fromVersion,
    applied,
    legacyReminderRows,
  };
}

export interface DefaultSettings {
  readonly [key: string]: string;
}

export function buildDefaultSettings(now: Date, timezone: string): DefaultSettings {
  return {
    timezone,
    default_list_id: DEFAULT_LIST_ID,
    quiet_hours_enabled: 'false',
    quiet_hours_start: '22:00',
    quiet_hours_end: '07:00',
    default_reminder_time: '09:00',
    snooze_minutes: '10',
    recurrence_horizon_days: '14',
    recurrence_horizon_count: '10',
    max_pending_alarms: '200',
    week_starts_on: '1',
    seeded_at: String(now.getTime()),
  };
}

/**
 * Idempotent seed for the default list and settings. Kept separate from the
 * schema migration so the device time zone is resolved by the app runtime.
 */
export async function seedDefaults(db: DB, timezone: string): Promise<void> {
  const now = systemClock.now().getTime();
  await db.transaction(async tx => {
    await tx.execute(
      `INSERT OR IGNORE INTO "list"
        (id, name, color, is_default, sort_order, archived_at, created_at, updated_at)
       VALUES (?, 'Inbox', NULL, 1, 0, NULL, ?, ?)`,
      [DEFAULT_LIST_ID, now, now],
    );
    for (const [key, value] of Object.entries(buildDefaultSettings(systemClock.now(), timezone))) {
      await tx.execute(`INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES (?, ?, ?)`, [
        key,
        value,
        now,
      ]);
    }
  });
}
