import type { DbExecutor } from '@/db/m5';
import {
  booleanValue,
  nullable,
  nullableNumber,
  nullableText,
  numberValue,
  textValue,
  type SqliteRow,
} from '@/db/m5';

import {
  DEFAULT_NOTIFICATION_SETTINGS,
  type NotificationScheduleRecord,
  type NotificationSettings,
  type ReminderDefinition,
  type ScheduleStatus,
} from './types';

const REMINDER_COLUMNS = `id, task_id, label, kind, offset_minutes, local_date, local_time,
  is_exact, status, snooze_until, created_at, updated_at`;

const SCHEDULE_COLUMNS = `id, reminder_id, task_id, occurrence_id, dedupe_key, local_date,
  local_time, timezone, scheduled_at, snoozed_until, request_code, is_exact_requested,
  state, reason, status, last_fired_at, trigger_seq, delivered_seq, dismissed_seq,
  dismissed_at, created_at, updated_at`;

function kindValue(value: string): ReminderDefinition['kind'] {
  return value === 'absolute' ? 'absolute' : 'relative';
}

function reminderStatus(value: string): ReminderDefinition['status'] {
  switch (value) {
    case 'completed':
    case 'cancelled':
      return value;
    default:
      return 'scheduled';
  }
}

function scheduleStatus(value: string): ScheduleStatus {
  switch (value) {
    case 'fired':
    case 'completed':
    case 'cancelled':
      return value;
    default:
      return 'scheduled';
  }
}

export function rowToReminderDefinition(row: SqliteRow): ReminderDefinition {
  return {
    id: textValue(row, 'id'),
    taskId: textValue(row, 'task_id'),
    label: textValue(row, 'label'),
    kind: kindValue(textValue(row, 'kind')),
    offsetMinutes: numberValue(row, 'offset_minutes'),
    localDate: nullableText(row, 'local_date'),
    localTime: nullableText(row, 'local_time'),
    isExact: booleanValue(row, 'is_exact'),
    status: reminderStatus(textValue(row, 'status')),
    snoozeUntil: nullableNumber(row, 'snooze_until'),
    createdAt: numberValue(row, 'created_at'),
    updatedAt: numberValue(row, 'updated_at'),
  };
}

export function rowToSchedule(row: SqliteRow): NotificationScheduleRecord {
  return {
    id: textValue(row, 'id'),
    reminderId: textValue(row, 'reminder_id'),
    taskId: textValue(row, 'task_id'),
    occurrenceId: nullableText(row, 'occurrence_id'),
    dedupeKey: textValue(row, 'dedupe_key'),
    localDate: textValue(row, 'local_date'),
    localTime: textValue(row, 'local_time'),
    timezone: textValue(row, 'timezone'),
    scheduledAt: numberValue(row, 'scheduled_at'),
    snoozedUntil: nullableNumber(row, 'snoozed_until'),
    requestCode: numberValue(row, 'request_code'),
    isExactRequested: booleanValue(row, 'is_exact_requested'),
    state: textValue(row, 'state'),
    reason: nullableText(row, 'reason'),
    status: scheduleStatus(textValue(row, 'status')),
    lastFiredAt: nullableNumber(row, 'last_fired_at'),
    triggerSeq: numberValue(row, 'trigger_seq'),
    deliveredSeq: numberValue(row, 'delivered_seq'),
    dismissedSeq: numberValue(row, 'dismissed_seq'),
    dismissedAt: nullableNumber(row, 'dismissed_at'),
    createdAt: numberValue(row, 'created_at'),
    updatedAt: numberValue(row, 'updated_at'),
  };
}

export async function insertReminder(db: DbExecutor, reminder: ReminderDefinition): Promise<void> {
  await db.execute(
    `INSERT INTO reminder (${REMINDER_COLUMNS})
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      reminder.id,
      reminder.taskId,
      reminder.label,
      reminder.kind,
      reminder.offsetMinutes,
      nullable(reminder.localDate),
      nullable(reminder.localTime),
      reminder.isExact ? 1 : 0,
      reminder.status,
      nullable(reminder.snoozeUntil),
      reminder.createdAt,
      reminder.updatedAt,
    ],
  );
}

export async function updateReminderRow(
  db: DbExecutor,
  reminder: ReminderDefinition,
): Promise<void> {
  await db.execute(
    `UPDATE reminder SET label = ?, kind = ?, offset_minutes = ?, local_date = ?,
      local_time = ?, is_exact = ?, status = ?, snooze_until = ?, updated_at = ?
     WHERE id = ?`,
    [
      reminder.label,
      reminder.kind,
      reminder.offsetMinutes,
      nullable(reminder.localDate),
      nullable(reminder.localTime),
      reminder.isExact ? 1 : 0,
      reminder.status,
      nullable(reminder.snoozeUntil),
      reminder.updatedAt,
      reminder.id,
    ],
  );
}

export async function findReminder(db: DbExecutor, id: string): Promise<ReminderDefinition | null> {
  const result = await db.execute(`SELECT ${REMINDER_COLUMNS} FROM reminder WHERE id = ?`, [id]);
  const row = result.rows[0];
  return row === undefined ? null : rowToReminderDefinition(row);
}

export async function listReminders(db: DbExecutor): Promise<ReminderDefinition[]> {
  const result = await db.execute(
    `SELECT ${REMINDER_COLUMNS} FROM reminder ORDER BY created_at ASC`,
  );
  return result.rows.map(rowToReminderDefinition);
}

export async function listRemindersForTask(
  db: DbExecutor,
  taskId: string,
): Promise<ReminderDefinition[]> {
  const result = await db.execute(
    `SELECT ${REMINDER_COLUMNS} FROM reminder WHERE task_id = ? ORDER BY created_at ASC`,
    [taskId],
  );
  return result.rows.map(rowToReminderDefinition);
}

export async function deleteReminder(db: DbExecutor, id: string): Promise<void> {
  await db.execute('DELETE FROM reminder WHERE id = ?', [id]);
}

export async function cancelRemindersForTask(
  db: DbExecutor,
  taskId: string,
  now: number,
): Promise<void> {
  await db.execute(
    `UPDATE reminder SET status = 'cancelled', updated_at = ?
     WHERE task_id = ? AND status = 'scheduled'`,
    [now, taskId],
  );
}

export async function insertSchedule(
  db: DbExecutor,
  schedule: NotificationScheduleRecord,
): Promise<void> {
  await db.execute(
    `INSERT INTO notification_schedule (${SCHEDULE_COLUMNS})
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      schedule.id,
      schedule.reminderId,
      schedule.taskId,
      nullable(schedule.occurrenceId),
      schedule.dedupeKey,
      schedule.localDate,
      schedule.localTime,
      schedule.timezone,
      schedule.scheduledAt,
      nullable(schedule.snoozedUntil),
      schedule.requestCode,
      schedule.isExactRequested ? 1 : 0,
      schedule.state,
      nullable(schedule.reason),
      schedule.status,
      nullable(schedule.lastFiredAt),
      schedule.triggerSeq,
      schedule.deliveredSeq,
      schedule.dismissedSeq,
      nullable(schedule.dismissedAt),
      schedule.createdAt,
      schedule.updatedAt,
    ],
  );
}

export async function updateScheduleRow(
  db: DbExecutor,
  schedule: NotificationScheduleRecord,
): Promise<void> {
  await db.execute(
    `UPDATE notification_schedule SET reminder_id = ?, task_id = ?, occurrence_id = ?,
      dedupe_key = ?, local_date = ?, local_time = ?, timezone = ?, scheduled_at = ?,
      snoozed_until = ?, request_code = ?, is_exact_requested = ?, state = ?, reason = ?,
      status = ?, last_fired_at = ?, trigger_seq = ?, delivered_seq = ?, dismissed_seq = ?,
      dismissed_at = ?, updated_at = ?
     WHERE id = ?`,
    [
      schedule.reminderId,
      schedule.taskId,
      nullable(schedule.occurrenceId),
      schedule.dedupeKey,
      schedule.localDate,
      schedule.localTime,
      schedule.timezone,
      schedule.scheduledAt,
      nullable(schedule.snoozedUntil),
      schedule.requestCode,
      schedule.isExactRequested ? 1 : 0,
      schedule.state,
      nullable(schedule.reason),
      schedule.status,
      nullable(schedule.lastFiredAt),
      schedule.triggerSeq,
      schedule.deliveredSeq,
      schedule.dismissedSeq,
      nullable(schedule.dismissedAt),
      schedule.updatedAt,
      schedule.id,
    ],
  );
}

export async function findSchedule(
  db: DbExecutor,
  id: string,
): Promise<NotificationScheduleRecord | null> {
  const result = await db.execute(
    `SELECT ${SCHEDULE_COLUMNS} FROM notification_schedule WHERE id = ?`,
    [id],
  );
  const row = result.rows[0];
  return row === undefined ? null : rowToSchedule(row);
}

export async function listSchedules(db: DbExecutor): Promise<NotificationScheduleRecord[]> {
  const result = await db.execute(
    `SELECT ${SCHEDULE_COLUMNS} FROM notification_schedule ORDER BY scheduled_at ASC`,
  );
  return result.rows.map(rowToSchedule);
}

export async function deleteSchedule(db: DbExecutor, id: string): Promise<void> {
  await db.execute('DELETE FROM notification_schedule WHERE id = ?', [id]);
}

export async function upsertSchedule(
  db: DbExecutor,
  schedule: NotificationScheduleRecord,
): Promise<void> {
  await db.execute(
    `INSERT INTO notification_schedule (${SCHEDULE_COLUMNS})
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       reminder_id = excluded.reminder_id,
       task_id = excluded.task_id,
       occurrence_id = excluded.occurrence_id,
       dedupe_key = excluded.dedupe_key,
       local_date = excluded.local_date,
       local_time = excluded.local_time,
       timezone = excluded.timezone,
       scheduled_at = excluded.scheduled_at,
       snoozed_until = excluded.snoozed_until,
       request_code = excluded.request_code,
       is_exact_requested = excluded.is_exact_requested,
       state = excluded.state,
       reason = excluded.reason,
       status = excluded.status,
       last_fired_at = COALESCE(excluded.last_fired_at, notification_schedule.last_fired_at),
       trigger_seq = MAX(notification_schedule.trigger_seq, excluded.trigger_seq),
       delivered_seq = MAX(notification_schedule.delivered_seq, excluded.delivered_seq),
       dismissed_seq = MAX(notification_schedule.dismissed_seq, excluded.dismissed_seq),
       dismissed_at = COALESCE(excluded.dismissed_at, notification_schedule.dismissed_at),
       updated_at = excluded.updated_at`,
    [
      schedule.id,
      schedule.reminderId,
      schedule.taskId,
      nullable(schedule.occurrenceId),
      schedule.dedupeKey,
      schedule.localDate,
      schedule.localTime,
      schedule.timezone,
      schedule.scheduledAt,
      nullable(schedule.snoozedUntil),
      schedule.requestCode,
      schedule.isExactRequested ? 1 : 0,
      schedule.state,
      nullable(schedule.reason),
      schedule.status,
      nullable(schedule.lastFiredAt),
      schedule.triggerSeq,
      schedule.deliveredSeq,
      schedule.dismissedSeq,
      nullable(schedule.dismissedAt),
      schedule.createdAt,
      schedule.updatedAt,
    ],
  );
}

export async function deleteSchedulesForReminders(
  db: DbExecutor,
  reminderIds: readonly string[],
): Promise<void> {
  if (reminderIds.length === 0) return;
  const placeholders = reminderIds.map(() => '?').join(', ');
  await db.execute(`DELETE FROM notification_schedule WHERE reminder_id IN (${placeholders})`, [
    ...reminderIds,
  ]);
}

export async function updateScheduleState(
  db: DbExecutor,
  id: string,
  state: string,
  reason: string | null,
  scheduledAt: number | null,
  now: number,
): Promise<void> {
  await db.execute(
    `UPDATE notification_schedule SET state = ?, reason = ?, scheduled_at = COALESCE(?, scheduled_at),
      updated_at = ? WHERE id = ?`,
    [state, nullable(reason), nullable(scheduledAt), now, id],
  );
}

export async function markScheduleFired(db: DbExecutor, id: string, now: number): Promise<void> {
  await db.execute(
    `UPDATE notification_schedule SET state = 'fired', last_fired_at = ?, updated_at = ?
     WHERE id = ?`,
    [now, now, id],
  );
}

export async function insertReminderEvent(
  db: DbExecutor,
  event: {
    readonly id: string;
    readonly reminderId: string | null;
    readonly scheduleId: string | null;
    readonly taskId: string | null;
    readonly occurrenceId: string | null;
    readonly type: string;
    readonly detail: string;
    readonly createdAt: number;
  },
): Promise<void> {
  await db.execute(
    `INSERT INTO reminder_event
      (id, reminder_id, schedule_id, task_id, occurrence_id, type, detail, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      event.id,
      nullable(event.reminderId),
      nullable(event.scheduleId),
      nullable(event.taskId),
      nullable(event.occurrenceId),
      event.type,
      event.detail,
      event.createdAt,
    ],
  );
}

export async function listRecentEvents(
  db: DbExecutor,
  limit = 20,
): Promise<readonly Readonly<Record<string, unknown>>[]> {
  const result = await db.execute(
    `SELECT id, type, detail, created_at FROM reminder_event ORDER BY created_at DESC LIMIT ?`,
    [limit],
  );
  return result.rows;
}

export async function readSettings(db: DbExecutor): Promise<NotificationSettings> {
  const result = await db.execute('SELECT key, value FROM settings');
  const values = new Map<string, string>();
  for (const row of result.rows) {
    const key = nullableText(row, 'key');
    const value = nullableText(row, 'value');
    if (key !== null && value !== null) values.set(key, value);
  }

  const boolean = (key: string, fallback: boolean): boolean => {
    const raw = values.get(key);
    if (raw === undefined) return fallback;
    return raw === 'true' || raw === '1';
  };
  const integer = (key: string, fallback: number): number => {
    const raw = values.get(key);
    const parsed = raw === undefined ? Number.NaN : Number(raw);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
  };
  const text = (key: string, fallback: string): string => values.get(key) ?? fallback;

  return {
    timezone: text('timezone', DEFAULT_NOTIFICATION_SETTINGS.timezone),
    quietHoursEnabled: boolean(
      'quiet_hours_enabled',
      DEFAULT_NOTIFICATION_SETTINGS.quietHoursEnabled,
    ),
    quietHoursStart: text('quiet_hours_start', DEFAULT_NOTIFICATION_SETTINGS.quietHoursStart),
    quietHoursEnd: text('quiet_hours_end', DEFAULT_NOTIFICATION_SETTINGS.quietHoursEnd),
    defaultReminderTime: text(
      'default_reminder_time',
      DEFAULT_NOTIFICATION_SETTINGS.defaultReminderTime,
    ),
    snoozeMinutes: Math.max(
      1,
      integer('snooze_minutes', DEFAULT_NOTIFICATION_SETTINGS.snoozeMinutes),
    ),
    recurrenceHorizonDays: Math.max(
      1,
      integer('recurrence_horizon_days', DEFAULT_NOTIFICATION_SETTINGS.recurrenceHorizonDays),
    ),
    recurrenceHorizonCount: Math.max(
      1,
      integer('recurrence_horizon_count', DEFAULT_NOTIFICATION_SETTINGS.recurrenceHorizonCount),
    ),
    maxPendingAlarms: Math.max(
      1,
      integer('max_pending_alarms', DEFAULT_NOTIFICATION_SETTINGS.maxPendingAlarms),
    ),
  };
}

export async function writeSetting(
  db: DbExecutor,
  key: string,
  value: string,
  now: number,
): Promise<void> {
  await db.execute(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, value, now],
  );
}

export async function writeSettings(
  db: DbExecutor,
  settings: Partial<NotificationSettings>,
  now: number,
): Promise<void> {
  const entries: [string, string][] = [];
  if (settings.timezone !== undefined) entries.push(['timezone', settings.timezone]);
  if (settings.quietHoursEnabled !== undefined) {
    entries.push(['quiet_hours_enabled', settings.quietHoursEnabled ? 'true' : 'false']);
  }
  if (settings.quietHoursStart !== undefined) {
    entries.push(['quiet_hours_start', settings.quietHoursStart]);
  }
  if (settings.quietHoursEnd !== undefined) {
    entries.push(['quiet_hours_end', settings.quietHoursEnd]);
  }
  if (settings.defaultReminderTime !== undefined) {
    entries.push(['default_reminder_time', settings.defaultReminderTime]);
  }
  if (settings.snoozeMinutes !== undefined) {
    entries.push(['snooze_minutes', String(settings.snoozeMinutes)]);
  }
  if (settings.recurrenceHorizonDays !== undefined) {
    entries.push(['recurrence_horizon_days', String(settings.recurrenceHorizonDays)]);
  }
  if (settings.recurrenceHorizonCount !== undefined) {
    entries.push(['recurrence_horizon_count', String(settings.recurrenceHorizonCount)]);
  }
  if (settings.maxPendingAlarms !== undefined) {
    entries.push(['max_pending_alarms', String(settings.maxPendingAlarms)]);
  }
  for (const [key, value] of entries) {
    await writeSetting(db, key, value, now);
  }
}
