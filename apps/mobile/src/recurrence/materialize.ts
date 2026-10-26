import { createEntityId } from '@/core/ids/ulid';
import { textValue, type DbExecutor } from '@/db/m5';
import { deriveDueAt } from '@/tasks/lifecycle';
import type { Task } from '@/tasks/types';

import { generateOccurrences, nextOccurrenceAfterCompletion } from './engine';
import {
  insertOccurrence,
  listOccurrenceDates,
  updateRuleRow,
  type OccurrenceRow,
} from './repository';
import { addDays, localDateInZone } from './time';
import type { RecurrencePattern, RecurrenceRule } from './types';

export interface MaterializeOptions {
  readonly now: number;
  /** Current local date in the device zone. Defaults to the rule time zone. */
  readonly today?: string;
  readonly horizonDays?: number;
  readonly timeZone?: string;
}

export function ruleToPattern(rule: RecurrenceRule): RecurrencePattern {
  return {
    frequency: rule.frequency,
    interval: rule.interval,
    weekdays: rule.weekdays,
    monthlyMode: rule.monthlyMode,
    monthDay: rule.monthDay,
    nth: rule.nth,
    weekday: rule.weekday,
    startDate: rule.startDate,
    startTime: rule.startTime,
    timezone: rule.timezone,
    endDate: rule.endDate,
    endAfterCount: rule.endAfterCount,
    repeatAfterCompletion: rule.repeatAfterCompletion,
  };
}

interface OccurrenceInsert {
  readonly date: string;
  readonly time: string | null;
  readonly epochMillis: number | null;
}

async function insertOccurrenceWithTask(
  db: DbExecutor,
  rule: RecurrenceRule,
  template: Task,
  entry: OccurrenceInsert,
  now: number,
  timeZone: string,
): Promise<OccurrenceRow> {
  const occurrenceId = createEntityId('occ');
  const taskId = createEntityId('task');
  const occurrenceTask: Task = {
    ...template,
    id: taskId,
    seriesId: template.id,
    title: template.title,
    notes: template.notes,
    status: 'todo',
    dueDate: entry.date,
    dueTime: entry.time,
    dueAt: deriveDueAt(entry.date, entry.time, timeZone),
    isAllDay: entry.time === null,
    occurrenceDate: entry.date,
    isRecurrenceTemplate: false,
    sortOrder: template.sortOrder,
    completedAt: null,
    archivedAt: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  const occurrence: OccurrenceRow = {
    id: occurrenceId,
    ruleId: rule.id,
    taskId,
    occurrenceDate: entry.date,
    occurrenceTime: entry.time,
    status: 'pending',
    isException: false,
    scheduledAt: entry.epochMillis,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  await db.execute(
    `INSERT INTO task (id, list_id, series_id, title, notes, status, priority,
      due_date, due_time, due_at, is_all_day, occurrence_date, is_recurrence_template,
      sort_order, completed_at, archived_at, deleted_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, NULL, NULL, NULL, ?, ?)`,
    [
      occurrenceTask.id,
      occurrenceTask.listId,
      occurrenceTask.seriesId,
      occurrenceTask.title,
      occurrenceTask.notes,
      occurrenceTask.status,
      occurrenceTask.priority,
      occurrenceTask.dueDate,
      occurrenceTask.dueTime,
      occurrenceTask.dueAt,
      occurrenceTask.isAllDay ? 1 : 0,
      occurrenceTask.occurrenceDate,
      occurrenceTask.sortOrder,
      now,
      now,
    ],
  );
  await insertOccurrence(db, occurrence);
  return occurrence;
}

/**
 * Materializes the next calendar window of a rule, skipping dates that already
 * have an occurrence row (including completed and skipped ones).
 *
 * Repeat-after-completion rules never materialize a window: their next
 * occurrence is created only when the current one is completed.
 */
export async function materializeRule(
  db: DbExecutor,
  rule: RecurrenceRule,
  template: Task,
  options: MaterializeOptions,
): Promise<number> {
  if (!rule.isActive || rule.repeatAfterCompletion) return 0;
  const timeZone = options.timeZone ?? rule.timezone;
  const today = options.today ?? localDateInZone(options.now, timeZone);
  const horizonDays = options.horizonDays ?? 14;
  const fromDate = rule.startDate > today ? rule.startDate : today;
  const toDate = addDays(fromDate, Math.max(1, horizonDays));

  const generated = generateOccurrences(ruleToPattern(rule), {
    fromDate,
    toDate,
    maxOccurrences: 10,
  });
  if (generated.length === 0) return 0;

  const existing = new Set(await listOccurrenceDates(db, rule.id));
  let inserted = 0;
  for (const entry of generated) {
    if (existing.has(entry.date)) continue;
    await insertOccurrenceWithTask(
      db,
      rule,
      template,
      { date: entry.date, time: entry.time, epochMillis: entry.epochMillis },
      options.now,
      timeZone,
    );
    existing.add(entry.date);
    inserted += 1;
  }
  return inserted;
}

/**
 * Inserts exactly the next occurrence for a repeat-after-completion series.
 * Called inside the completion transaction so the following task exists before
 * the UI shows the completion.
 */
export async function materializeNextAfterCompletion(
  db: DbExecutor,
  rule: RecurrenceRule,
  template: Task,
  completionDate: string,
  completedCount: number,
  now: number,
  timeZone: string,
): Promise<OccurrenceRow | null> {
  const next = nextOccurrenceAfterCompletion(ruleToPattern(rule), {
    completionDate,
    completedCount,
  });
  if (next === null) return null;

  const existing = new Set(await listOccurrenceDates(db, rule.id));
  if (existing.has(next.date)) return null;
  return insertOccurrenceWithTask(
    db,
    rule,
    template,
    { date: next.date, time: next.time, epochMillis: next.epochMillis },
    now,
    timeZone,
  );
}

/** Deletes pending future occurrences and their materialized tasks. */
export async function dropPendingOccurrencesFrom(
  db: DbExecutor,
  ruleId: string,
  fromDate: string,
): Promise<number> {
  const result = await db.execute(
    `SELECT id, task_id FROM recurrence_occurrence
     WHERE rule_id = ? AND status = 'pending' AND occurrence_date >= ?`,
    [ruleId, fromDate],
  );
  let removed = 0;
  for (const row of result.rows) {
    const occurrenceId = textValue(row, 'id');
    const taskId = textValue(row, 'task_id');
    await db.execute('DELETE FROM notification_schedule WHERE occurrence_id = ?', [occurrenceId]);
    await db.execute('DELETE FROM reminder_event WHERE occurrence_id = ?', [occurrenceId]);
    await db.execute('DELETE FROM recurrence_occurrence WHERE id = ?', [occurrenceId]);
    await db.execute('DELETE FROM task WHERE id = ? AND series_id IS NOT NULL', [taskId]);
    removed += 1;
  }
  return removed;
}

export async function touchRule(
  db: DbExecutor,
  rule: RecurrenceRule,
  now: number,
): Promise<RecurrenceRule> {
  const updated: RecurrenceRule = { ...rule, updatedAt: now };
  await updateRuleRow(db, updated);
  return updated;
}
