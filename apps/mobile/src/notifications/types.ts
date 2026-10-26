import type { Task } from '@/tasks/types';

export const REMINDER_KINDS = ['relative', 'absolute'] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];

export const REMINDER_DEFINITION_STATUSES = ['scheduled', 'completed', 'cancelled'] as const;
export type ReminderDefinitionStatus = (typeof REMINDER_DEFINITION_STATUSES)[number];

export const SCHEDULE_STATUSES = ['scheduled', 'fired', 'completed', 'cancelled'] as const;
export type ScheduleStatus = (typeof SCHEDULE_STATUSES)[number];

export const OCCURRENCE_STATUSES = ['pending', 'completed', 'skipped', 'cancelled'] as const;
export type OccurrenceStatus = (typeof OCCURRENCE_STATUSES)[number];

export interface ReminderDefinition {
  readonly id: string;
  readonly taskId: string;
  readonly label: string;
  readonly kind: ReminderKind;
  /** Negative values fire before the task's due wall time. */
  readonly offsetMinutes: number;
  readonly localDate: string | null;
  readonly localTime: string | null;
  readonly isExact: boolean;
  readonly status: ReminderDefinitionStatus;
  readonly snoozeUntil: number | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface RecurrenceOccurrenceRecord {
  readonly id: string;
  readonly ruleId: string;
  readonly taskId: string;
  readonly occurrenceDate: string;
  readonly occurrenceTime: string | null;
  readonly status: OccurrenceStatus;
}

export interface NotificationScheduleRecord {
  readonly id: string;
  readonly reminderId: string;
  readonly taskId: string;
  readonly occurrenceId: string | null;
  readonly dedupeKey: string;
  readonly localDate: string;
  readonly localTime: string;
  readonly timezone: string;
  readonly scheduledAt: number;
  readonly snoozedUntil: number | null;
  readonly requestCode: number;
  readonly isExactRequested: boolean;
  readonly state: string;
  readonly reason: string | null;
  readonly status: ScheduleStatus;
  readonly lastFiredAt: number | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface NotificationSettings {
  readonly timezone: string;
  readonly quietHoursEnabled: boolean;
  readonly quietHoursStart: string;
  readonly quietHoursEnd: string;
  readonly defaultReminderTime: string;
  readonly snoozeMinutes: number;
  readonly recurrenceHorizonDays: number;
  readonly recurrenceHorizonCount: number;
  readonly maxPendingAlarms: number;
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  timezone: 'UTC',
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '07:00',
  defaultReminderTime: '09:00',
  snoozeMinutes: 10,
  recurrenceHorizonDays: 14,
  recurrenceHorizonCount: 10,
  maxPendingAlarms: 200,
};

export interface ScheduleTemplateContext {
  /** The task row that owns the reminder (template or one-off). */
  readonly reminderTask: Task;
  /** The concrete occurrence task, when the reminder belongs to a series. */
  readonly occurrenceTask: Task | null;
}

export interface PlannedSchedule {
  readonly id: string;
  readonly reminderId: string;
  readonly taskId: string;
  readonly occurrenceId: string | null;
  readonly dedupeKey: string;
  readonly localDate: string;
  readonly localTime: string;
  readonly timezone: string;
  readonly scheduledAt: number;
  readonly snoozedUntil: number | null;
  readonly requestCode: number;
  readonly isExactRequested: boolean;
  readonly state: string;
  readonly reason: string | null;
  readonly status: ScheduleStatus;
  readonly lastFiredAt: number | null;
  readonly title: string;
  readonly body: string;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface ReconcileInput {
  readonly now: number;
  readonly settings: NotificationSettings;
  readonly tasks: readonly Task[];
  readonly reminders: readonly ReminderDefinition[];
  readonly occurrences: readonly RecurrenceOccurrenceRecord[];
  readonly existing: readonly NotificationScheduleRecord[];
}

export interface ReconcilePlan {
  /** At most settings.maxPendingAlarms schedules, earliest first. */
  readonly desired: readonly PlannedSchedule[];
  /** Schedules beyond the cap. Persisted but not handed to the native layer. */
  readonly overflow: readonly PlannedSchedule[];
  /** Existing rows whose identity is no longer desired. */
  readonly dropped: readonly NotificationScheduleRecord[];
}

export interface NativeActionLike {
  readonly actionId: string;
  readonly type: string;
  readonly scheduleId: string;
  readonly requestCode: number;
  readonly snoozedUntil: number | null;
}
