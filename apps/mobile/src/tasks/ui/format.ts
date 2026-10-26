import type { TFunction } from 'i18next';

import type { RecurrenceStatusSummary, ReminderStatusSummary, Task } from '../types';
import { addDays } from '@/recurrence/time';
import { formatLocalDateLabel, formatLocalTimeLabel } from '@/recurrence/time';

export function dueLabel(date: string, time: string | null, today: string, t: TFunction): string {
  const day =
    date === today
      ? t('tasks.due.today')
      : date === addDays(today, 1)
        ? t('tasks.due.tomorrow')
        : date === addDays(today, -1)
          ? t('tasks.due.yesterday')
          : formatLocalDateLabel(date);
  return time === null ? day : `${day} · ${formatLocalTimeLabel(time)}`;
}

export function isOverdue(task: Task, today: string, now: number): boolean {
  if (task.dueDate === null) return false;
  if (task.status === 'done' || task.status === 'cancelled') return false;
  if (task.dueDate < today) return true;
  if (task.dueDate > today) return false;
  if (task.dueAt === null) return false;
  return task.dueAt < now;
}

export function priorityLabel(task: Task, t: TFunction): string {
  return t(`tasks.priority.${task.priority}`);
}

const WEEKDAY_KEYS = [
  'tasks.weekdayShort.1',
  'tasks.weekdayShort.2',
  'tasks.weekdayShort.3',
  'tasks.weekdayShort.4',
  'tasks.weekdayShort.5',
  'tasks.weekdayShort.6',
  'tasks.weekdayShort.7',
] as const;

/** ISO weekday (1 = Monday) to a short localised label. */
export function weekdayLabel(day: number, t: TFunction): string {
  return t(WEEKDAY_KEYS[day - 1] ?? WEEKDAY_KEYS[0]);
}

export function recurrenceLabel(
  summary: RecurrenceStatusSummary | undefined,
  t: TFunction,
): string | null {
  if (summary === undefined) return null;
  const frequency = summary.frequency ?? '';
  if (frequency.startsWith('weekly:')) {
    const weekdays = frequency
      .slice('weekly:'.length)
      .split(',')
      .filter(part => part.length > 0)
      .map(Number);
    const names = weekdays.map(day => weekdayLabel(day, t)).join(', ');
    return t('tasks.recurrence.weeklyOn', { days: names });
  }
  switch (frequency) {
    case 'daily':
      return t('tasks.recurrence.daily');
    case 'weekdays':
      return t('tasks.recurrence.weekdays');
    case 'monthly':
      return t('tasks.recurrence.monthly');
    case 'yearly':
      return t('tasks.recurrence.yearly');
    default:
      return t('tasks.recurrence.summary');
  }
}

export function reminderLabel(
  reminder: ReminderStatusSummary | undefined,
  t: TFunction,
): string | null {
  if (reminder === undefined) return null;
  if (reminder.status === 'cancelled') return t('tasks.reminder.status.cancelled');
  if (reminder.kind === 'absolute' && reminder.localDate !== null && reminder.localTime !== null) {
    return t('tasks.reminder.absoluteSummary', {
      date: formatLocalDateLabel(reminder.localDate),
      time: formatLocalTimeLabel(reminder.localTime),
    });
  }
  const offset = reminder.offsetMinutes;
  if (offset === 0) return t('tasks.reminder.atDue');
  const minutes = Math.abs(offset);
  if (minutes % 1_440 === 0) {
    return t('tasks.reminder.beforeDays', { count: minutes / 1_440 });
  }
  if (minutes % 60 === 0) {
    return t('tasks.reminder.beforeHours', { count: minutes / 60 });
  }
  return t('tasks.reminder.beforeMinutes', { count: minutes });
}

export function scheduleStateLabel(state: string | null, t: TFunction): string | null {
  if (state === null) return null;
  const key = `tasks.reminder.state.${state.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())}`;
  const translate = t as unknown as (translationKey: string) => string;
  const translated = translate(key);
  return translated === key ? t('tasks.reminder.state.pending') : translated;
}
