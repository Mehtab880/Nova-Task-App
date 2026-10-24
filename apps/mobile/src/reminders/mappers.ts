import { AppError } from '@/core/errors/AppError';

import { computeSnoozeUntil } from './policy';
import {
  REMINDER_SCHEDULE_STATES,
  REMINDER_STATUSES,
  type NativeReminderAction,
  type NativeReminderInput,
  type Reminder,
  type ReminderScheduleState,
  type ReminderStatus,
} from './types';

export type SqliteRow = Readonly<Record<string, unknown>>;

function stringValue(row: SqliteRow, key: string): string {
  const value = row[key];
  if (typeof value !== 'string') {
    throw new AppError({
      code: 'reminder_row_invalid',
      category: 'storage',
      message: `Reminder column ${key} is not text`,
      context: { key, valueType: typeof value },
    });
  }
  return value;
}

function numberValue(row: SqliteRow, key: string): number {
  const value = row[key];
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  throw new AppError({
    code: 'reminder_row_invalid',
    category: 'storage',
    message: `Reminder column ${key} is not numeric`,
    context: { key, valueType: typeof value },
  });
}

function nullableString(row: SqliteRow, key: string): string | null {
  const value = row[key];
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
}

function nullableNumber(row: SqliteRow, key: string): number | null {
  const value = row[key];
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function statusValue(value: string): ReminderStatus {
  return REMINDER_STATUSES.includes(value as ReminderStatus)
    ? (value as ReminderStatus)
    : 'scheduled';
}

function scheduleStateValue(value: string): ReminderScheduleState {
  return REMINDER_SCHEDULE_STATES.includes(value as ReminderScheduleState)
    ? (value as ReminderScheduleState)
    : 'pending';
}

export function rowToReminder(row: SqliteRow): Reminder {
  return {
    id: stringValue(row, 'id'),
    taskId: nullableString(row, 'task_id'),
    title: stringValue(row, 'title'),
    body: stringValue(row, 'body'),
    triggerAt: numberValue(row, 'trigger_at'),
    status: statusValue(stringValue(row, 'status')),
    requestCode: numberValue(row, 'request_code'),
    scheduleState: scheduleStateValue(stringValue(row, 'schedule_state')),
    scheduleReason: nullableString(row, 'schedule_reason'),
    snoozeUntil: nullableNumber(row, 'snooze_until'),
    createdAt: numberValue(row, 'created_at'),
    updatedAt: numberValue(row, 'updated_at'),
    completedAt: nullableNumber(row, 'completed_at'),
  };
}

export function toNativeInput(reminder: Reminder): NativeReminderInput {
  return {
    id: reminder.id,
    requestCode: reminder.requestCode,
    title: reminder.title,
    body: reminder.body,
    triggerAt: reminder.triggerAt,
    status: reminder.status,
  };
}

/**
 * Pure reducer for notification actions. The native queue is acknowledged only
 * after these updates commit to SQLite.
 */
export function applyNativeAction(
  reminder: Reminder,
  action: NativeReminderAction,
  now: number,
): Reminder | null {
  if (action.reminderId !== reminder.id || action.requestCode !== reminder.requestCode) {
    throw new AppError({
      code: 'reminder_action_mismatch',
      category: 'storage',
      message: 'Native action does not match the reminder being updated',
    });
  }

  if (action.type === 'complete') {
    if (reminder.status === 'completed') return null;
    if (reminder.status === 'cancelled') return null;
    return {
      ...reminder,
      status: 'completed',
      scheduleState: 'completed',
      scheduleReason: 'completed-from-notification',
      snoozeUntil: null,
      completedAt: now,
      updatedAt: now,
    };
  }

  if (reminder.status !== 'scheduled') {
    return null;
  }

  const snoozedUntil =
    action.snoozedUntil !== null && Number.isFinite(action.snoozedUntil)
      ? action.snoozedUntil
      : computeSnoozeUntil(now);

  return {
    ...reminder,
    triggerAt: snoozedUntil,
    status: 'scheduled',
    scheduleState: 'pending',
    scheduleReason: 'snoozed-from-notification',
    snoozeUntil: snoozedUntil,
    completedAt: null,
    updatedAt: now,
  };
}
