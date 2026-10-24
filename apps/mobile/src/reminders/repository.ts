import type { DB } from '@op-engineering/op-sqlite';

import { systemClock } from '@/core/time/Clock';
import { createEntityId } from '@/core/ids/ulid';
import { openNovaDatabase } from '@/db/client';

import { allocateRequestCode, validateReminderDraft } from './policy';
import { rowToReminder } from './mappers';
import {
  REMINDER_SCHEDULE_STATES,
  type NativeScheduleResult,
  type Reminder,
  type ReminderDraft,
  type ReminderScheduleState,
} from './types';

export const REMINDER_TABLE = 'task_reminders';

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS task_reminders (
  id TEXT PRIMARY KEY NOT NULL,
  task_id TEXT,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  trigger_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  request_code INTEGER NOT NULL UNIQUE,
  schedule_state TEXT NOT NULL DEFAULT 'pending',
  schedule_reason TEXT,
  snooze_until INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  completed_at INTEGER
)`;

const CREATE_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS idx_task_reminders_status_trigger
ON task_reminders (status, trigger_at)`;

const SELECT_COLUMNS = `
  id, task_id, title, body, trigger_at, status, request_code,
  schedule_state, schedule_reason, snooze_until, created_at, updated_at, completed_at
`;

let schemaReady: Promise<void> | null = null;
let serialQueue: Promise<void> = Promise.resolve();

function serialize<T>(task: () => Promise<T>): Promise<T> {
  const run = serialQueue.then(task, task);
  serialQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function ensureSchemaUnlocked(): Promise<void> {
  const db = await openNovaDatabase();
  await db.execute(CREATE_TABLE_SQL);
  await db.execute(CREATE_INDEX_SQL);
}

export function ensureReminderSchema(): Promise<void> {
  schemaReady ??= ensureSchemaUnlocked().catch(error => {
    schemaReady = null;
    throw error;
  });
  return schemaReady;
}

async function database(): Promise<DB> {
  await ensureReminderSchema();
  return openNovaDatabase();
}

function nowMs(): number {
  return systemClock.now().getTime();
}

function toScheduleState(value: string): ReminderScheduleState {
  return REMINDER_SCHEDULE_STATES.includes(value as ReminderScheduleState)
    ? (value as ReminderScheduleState)
    : 'pending';
}

export function listReminders(): Promise<Reminder[]> {
  return serialize(async () => {
    const db = await database();
    const result = await db.execute(
      `SELECT ${SELECT_COLUMNS} FROM ${REMINDER_TABLE}
       ORDER BY trigger_at ASC, created_at ASC`,
    );
    return result.rows.map(row => rowToReminder(row));
  });
}

export function listActiveReminders(): Promise<Reminder[]> {
  return serialize(async () => {
    const db = await database();
    const result = await db.execute(
      `SELECT ${SELECT_COLUMNS} FROM ${REMINDER_TABLE}
       WHERE status = 'scheduled'
       ORDER BY trigger_at ASC, created_at ASC`,
    );
    return result.rows.map(row => rowToReminder(row));
  });
}

export function getReminder(id: string): Promise<Reminder | null> {
  return serialize(async () => {
    const db = await database();
    const result = await db.execute(
      `SELECT ${SELECT_COLUMNS} FROM ${REMINDER_TABLE} WHERE id = ? LIMIT 1`,
      [id],
    );
    const row = result.rows[0];
    return row === undefined ? null : rowToReminder(row);
  });
}

export async function insertReminders(drafts: readonly ReminderDraft[]): Promise<Reminder[]> {
  if (drafts.length === 0) return [];
  return serialize(async () => {
    const db = await database();
    const created: Reminder[] = [];
    const now = nowMs();

    await db.transaction(async tx => {
      const usedResult = await tx.execute(`SELECT request_code FROM ${REMINDER_TABLE}`);
      const used = new Set(
        usedResult.rows
          .map(row => row['request_code'])
          .filter((value): value is number => typeof value === 'number' && Number.isFinite(value)),
      );
      for (const rawDraft of drafts) {
        const draft = validateReminderDraft(rawDraft);
        const requestCode = allocateRequestCode(used);
        used.add(requestCode);
        const id = createEntityId('reminder');
        await tx.execute(
          `INSERT INTO ${REMINDER_TABLE}
            (id, task_id, title, body, trigger_at, status, request_code,
             schedule_state, schedule_reason, snooze_until, created_at, updated_at, completed_at)
           VALUES (?, ?, ?, ?, ?, 'scheduled', ?, 'pending', NULL, NULL, ?, ?, NULL)`,
          [
            id,
            draft.taskId ?? null,
            draft.title,
            draft.body ?? '',
            draft.triggerAt,
            requestCode,
            now,
            now,
          ],
        );
        created.push({
          id,
          taskId: draft.taskId ?? null,
          title: draft.title,
          body: draft.body ?? '',
          triggerAt: draft.triggerAt,
          status: 'scheduled',
          requestCode,
          scheduleState: 'pending',
          scheduleReason: null,
          snoozeUntil: null,
          createdAt: now,
          updatedAt: now,
          completedAt: null,
        });
      }
    });

    return created;
  });
}

export function insertReminder(draft: ReminderDraft): Promise<Reminder> {
  return insertReminders([draft]).then(reminders => {
    const created = reminders[0];
    if (created === undefined) {
      throw new Error('Reminder insert returned no record');
    }
    return created;
  });
}

export function updateScheduleStates(results: readonly NativeScheduleResult[]): Promise<void> {
  if (results.length === 0) return Promise.resolve();
  return serialize(async () => {
    const db = await database();
    const updatedAt = nowMs();
    await db.transaction(async tx => {
      for (const result of results) {
        await tx.execute(
          `UPDATE ${REMINDER_TABLE}
           SET schedule_state = ?, schedule_reason = ?, updated_at = ?
           WHERE id = ? AND status = 'scheduled'`,
          [toScheduleState(result.state), result.reason, updatedAt, result.id],
        );
      }
    });
  });
}

export function saveReminder(reminder: Reminder): Promise<void> {
  return serialize(async () => {
    const db = await database();
    await db.execute(
      `UPDATE ${REMINDER_TABLE}
       SET task_id = ?, title = ?, body = ?, trigger_at = ?, status = ?, request_code = ?,
           schedule_state = ?, schedule_reason = ?, snooze_until = ?,
           updated_at = ?, completed_at = ?
       WHERE id = ?`,
      [
        reminder.taskId,
        reminder.title,
        reminder.body,
        reminder.triggerAt,
        reminder.status,
        reminder.requestCode,
        reminder.scheduleState,
        reminder.scheduleReason,
        reminder.snoozeUntil,
        reminder.updatedAt,
        reminder.completedAt,
        reminder.id,
      ],
    );
  });
}

export function completeReminderRecord(id: string): Promise<void> {
  return serialize(async () => {
    const db = await database();
    const now = nowMs();
    await db.execute(
      `UPDATE ${REMINDER_TABLE}
       SET status = 'completed', schedule_state = 'completed',
           schedule_reason = 'completed-from-app', snooze_until = NULL,
           completed_at = ?, updated_at = ?
       WHERE id = ? AND status = 'scheduled'`,
      [now, now, id],
    );
  });
}

export function snoozeReminderRecord(id: string, snoozedUntil: number): Promise<void> {
  return serialize(async () => {
    const db = await database();
    const now = nowMs();
    await db.execute(
      `UPDATE ${REMINDER_TABLE}
       SET trigger_at = ?, status = 'scheduled', schedule_state = 'pending',
           schedule_reason = 'snoozed-from-app', snooze_until = ?,
           completed_at = NULL, updated_at = ?
       WHERE id = ? AND status = 'scheduled'`,
      [snoozedUntil, snoozedUntil, now, id],
    );
  });
}

export function cancelReminderRecord(id: string): Promise<void> {
  return serialize(async () => {
    const db = await database();
    const now = nowMs();
    await db.execute(
      `UPDATE ${REMINDER_TABLE}
       SET status = 'cancelled', schedule_state = 'cancelled',
           schedule_reason = 'cancelled-from-app', snooze_until = NULL,
           updated_at = ?
       WHERE id = ? AND status = 'scheduled'`,
      [now, id],
    );
  });
}

export function deleteAllReminders(): Promise<void> {
  return serialize(async () => {
    const db = await database();
    await db.execute(`DELETE FROM ${REMINDER_TABLE}`);
  });
}

export function countReminders(): Promise<number> {
  return serialize(async () => {
    const db = await database();
    const result = await db.execute(`SELECT COUNT(*) AS count FROM ${REMINDER_TABLE}`);
    const value = result.rows[0]?.['count'];
    return typeof value === 'number' ? value : 0;
  });
}
