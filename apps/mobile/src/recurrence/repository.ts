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
import type { RecurrenceOccurrenceRecord } from '@/notifications/types';

import type { RecurrenceFrequency, RecurrenceRule, MonthlyMode } from './types';

const RULE_COLUMNS = `id, task_id, frequency, interval, weekdays, monthly_mode, month_day,
  nth, weekday, start_date, start_time, timezone, end_date, end_after_count,
  completed_count, repeat_after_completion, is_active, created_at, updated_at`;

const OCCURRENCE_COLUMNS = `id, rule_id, task_id, occurrence_date, occurrence_time,
  status, is_exception, scheduled_at, completed_at, created_at, updated_at`;

function frequencyValue(value: string): RecurrenceFrequency {
  switch (value) {
    case 'daily':
    case 'weekdays':
    case 'weekly':
    case 'monthly':
    case 'yearly':
      return value;
    default:
      return 'daily';
  }
}

function monthlyModeValue(value: string): MonthlyMode {
  return value === 'nth_weekday' ? 'nth_weekday' : 'day_of_month';
}

function occurrenceStatus(value: string): RecurrenceOccurrenceRecord['status'] {
  switch (value) {
    case 'completed':
    case 'skipped':
    case 'cancelled':
      return value;
    default:
      return 'pending';
  }
}

export function rowToRule(row: SqliteRow): RecurrenceRule {
  const weekdays = nullableText(row, 'weekdays') ?? '';
  return {
    id: textValue(row, 'id'),
    taskId: textValue(row, 'task_id'),
    frequency: frequencyValue(textValue(row, 'frequency')),
    interval: Math.max(1, numberValue(row, 'interval')),
    weekdays: weekdays.length === 0 ? [] : weekdays.split(',').map(Number),
    monthlyMode: monthlyModeValue(textValue(row, 'monthly_mode')),
    monthDay: nullableNumber(row, 'month_day'),
    nth: nullableNumber(row, 'nth'),
    weekday: nullableNumber(row, 'weekday'),
    startDate: textValue(row, 'start_date'),
    startTime: nullableText(row, 'start_time'),
    timezone: textValue(row, 'timezone'),
    endDate: nullableText(row, 'end_date'),
    endAfterCount: nullableNumber(row, 'end_after_count'),
    completedCount: numberValue(row, 'completed_count'),
    repeatAfterCompletion: booleanValue(row, 'repeat_after_completion'),
    isActive: booleanValue(row, 'is_active'),
    createdAt: numberValue(row, 'created_at'),
    updatedAt: numberValue(row, 'updated_at'),
  };
}

export function rowToOccurrence(row: SqliteRow): RecurrenceOccurrenceRecord & {
  readonly isException: boolean;
  readonly scheduledAt: number | null;
  readonly completedAt: number | null;
  readonly createdAt: number;
  readonly updatedAt: number;
} {
  return {
    id: textValue(row, 'id'),
    ruleId: textValue(row, 'rule_id'),
    taskId: textValue(row, 'task_id'),
    occurrenceDate: textValue(row, 'occurrence_date'),
    occurrenceTime: nullableText(row, 'occurrence_time'),
    status: occurrenceStatus(textValue(row, 'status')),
    isException: booleanValue(row, 'is_exception'),
    scheduledAt: nullableNumber(row, 'scheduled_at'),
    completedAt: nullableNumber(row, 'completed_at'),
    createdAt: numberValue(row, 'created_at'),
    updatedAt: numberValue(row, 'updated_at'),
  };
}

export type OccurrenceRow = ReturnType<typeof rowToOccurrence>;

export async function insertRule(db: DbExecutor, rule: RecurrenceRule): Promise<void> {
  await db.execute(
    `INSERT INTO recurrence_rule (${RULE_COLUMNS})
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      rule.id,
      rule.taskId,
      rule.frequency,
      rule.interval,
      rule.weekdays.join(','),
      rule.monthlyMode,
      nullable(rule.monthDay),
      nullable(rule.nth),
      nullable(rule.weekday),
      rule.startDate,
      nullable(rule.startTime),
      rule.timezone,
      nullable(rule.endDate),
      nullable(rule.endAfterCount),
      rule.completedCount,
      rule.repeatAfterCompletion ? 1 : 0,
      rule.isActive ? 1 : 0,
      rule.createdAt,
      rule.updatedAt,
    ],
  );
}

export async function updateRuleRow(db: DbExecutor, rule: RecurrenceRule): Promise<void> {
  await db.execute(
    `UPDATE recurrence_rule SET
      frequency = ?, interval = ?, weekdays = ?, monthly_mode = ?, month_day = ?,
      nth = ?, weekday = ?, start_date = ?, start_time = ?, timezone = ?,
      end_date = ?, end_after_count = ?, completed_count = ?,
      repeat_after_completion = ?, is_active = ?, updated_at = ?
     WHERE id = ?`,
    [
      rule.frequency,
      rule.interval,
      rule.weekdays.join(','),
      rule.monthlyMode,
      nullable(rule.monthDay),
      nullable(rule.nth),
      nullable(rule.weekday),
      rule.startDate,
      nullable(rule.startTime),
      rule.timezone,
      nullable(rule.endDate),
      nullable(rule.endAfterCount),
      rule.completedCount,
      rule.repeatAfterCompletion ? 1 : 0,
      rule.isActive ? 1 : 0,
      rule.updatedAt,
      rule.id,
    ],
  );
}

export async function findRuleById(db: DbExecutor, id: string): Promise<RecurrenceRule | null> {
  const result = await db.execute(`SELECT ${RULE_COLUMNS} FROM recurrence_rule WHERE id = ?`, [id]);
  const row = result.rows[0];
  return row === undefined ? null : rowToRule(row);
}

export async function findRuleByTaskId(
  db: DbExecutor,
  taskId: string,
): Promise<RecurrenceRule | null> {
  const result = await db.execute(`SELECT ${RULE_COLUMNS} FROM recurrence_rule WHERE task_id = ?`, [
    taskId,
  ]);
  const row = result.rows[0];
  return row === undefined ? null : rowToRule(row);
}

export async function listRules(db: DbExecutor): Promise<RecurrenceRule[]> {
  const result = await db.execute(
    `SELECT ${RULE_COLUMNS} FROM recurrence_rule ORDER BY created_at ASC`,
  );
  return result.rows.map(rowToRule);
}

export async function deleteRule(db: DbExecutor, id: string): Promise<void> {
  await db.execute('DELETE FROM recurrence_rule WHERE id = ?', [id]);
}

export async function deactivateRule(db: DbExecutor, id: string, now: number): Promise<void> {
  await db.execute('UPDATE recurrence_rule SET is_active = 0, updated_at = ? WHERE id = ?', [
    now,
    id,
  ]);
}

export async function insertOccurrence(db: DbExecutor, occurrence: OccurrenceRow): Promise<void> {
  await db.execute(
    `INSERT INTO recurrence_occurrence (${OCCURRENCE_COLUMNS})
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      occurrence.id,
      occurrence.ruleId,
      occurrence.taskId,
      occurrence.occurrenceDate,
      nullable(occurrence.occurrenceTime),
      occurrence.status,
      occurrence.isException ? 1 : 0,
      nullable(occurrence.scheduledAt),
      nullable(occurrence.completedAt),
      occurrence.createdAt,
      occurrence.updatedAt,
    ],
  );
}

export async function updateOccurrenceRow(
  db: DbExecutor,
  occurrence: OccurrenceRow,
): Promise<void> {
  await db.execute(
    `UPDATE recurrence_occurrence SET
      occurrence_date = ?, occurrence_time = ?, status = ?, is_exception = ?,
      scheduled_at = ?, completed_at = ?, updated_at = ?
     WHERE id = ?`,
    [
      occurrence.occurrenceDate,
      nullable(occurrence.occurrenceTime),
      occurrence.status,
      occurrence.isException ? 1 : 0,
      nullable(occurrence.scheduledAt),
      nullable(occurrence.completedAt),
      occurrence.updatedAt,
      occurrence.id,
    ],
  );
}

export async function findOccurrenceById(
  db: DbExecutor,
  id: string,
): Promise<OccurrenceRow | null> {
  const result = await db.execute(
    `SELECT ${OCCURRENCE_COLUMNS} FROM recurrence_occurrence WHERE id = ?`,
    [id],
  );
  const row = result.rows[0];
  return row === undefined ? null : rowToOccurrence(row);
}

export async function findOccurrenceByTaskId(
  db: DbExecutor,
  taskId: string,
): Promise<OccurrenceRow | null> {
  const result = await db.execute(
    `SELECT ${OCCURRENCE_COLUMNS} FROM recurrence_occurrence WHERE task_id = ?`,
    [taskId],
  );
  const row = result.rows[0];
  return row === undefined ? null : rowToOccurrence(row);
}

export async function listOccurrencesForRule(
  db: DbExecutor,
  ruleId: string,
): Promise<OccurrenceRow[]> {
  const result = await db.execute(
    `SELECT ${OCCURRENCE_COLUMNS} FROM recurrence_occurrence
     WHERE rule_id = ? ORDER BY occurrence_date ASC`,
    [ruleId],
  );
  return result.rows.map(rowToOccurrence);
}

export async function listAllOccurrences(db: DbExecutor): Promise<OccurrenceRow[]> {
  const result = await db.execute(
    `SELECT ${OCCURRENCE_COLUMNS} FROM recurrence_occurrence ORDER BY occurrence_date ASC`,
  );
  return result.rows.map(rowToOccurrence);
}

export async function listPendingOccurrences(db: DbExecutor): Promise<OccurrenceRow[]> {
  const result = await db.execute(
    `SELECT ${OCCURRENCE_COLUMNS} FROM recurrence_occurrence
     WHERE status = 'pending' ORDER BY occurrence_date ASC`,
  );
  return result.rows.map(rowToOccurrence);
}

export async function listOccurrenceDates(db: DbExecutor, ruleId: string): Promise<string[]> {
  const result = await db.execute(
    'SELECT occurrence_date FROM recurrence_occurrence WHERE rule_id = ?',
    [ruleId],
  );
  return result.rows.map(row => textValue(row, 'occurrence_date'));
}

export async function updateOccurrenceStatus(
  db: DbExecutor,
  id: string,
  status: OccurrenceRow['status'],
  now: number,
  completedAt: number | null,
): Promise<void> {
  await db.execute(
    `UPDATE recurrence_occurrence SET status = ?, completed_at = ?, updated_at = ? WHERE id = ?`,
    [status, nullable(completedAt), now, id],
  );
}

export async function markOccurrenceException(
  db: DbExecutor,
  id: string,
  now: number,
): Promise<void> {
  await db.execute(
    'UPDATE recurrence_occurrence SET is_exception = 1, updated_at = ? WHERE id = ?',
    [now, id],
  );
}
