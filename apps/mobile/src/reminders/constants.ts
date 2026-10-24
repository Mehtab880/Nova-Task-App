/** M4 constants mirrored by NovaRemindersModule.kt. */
export const MAX_PENDING_ALARMS = 200;
export const DEFAULT_SNOOZE_MINUTES = 10;
export const MAX_REQUEST_CODE = 700_000_000;
export const REMINDER_CHANNEL_ID = 'task_reminders';
export const REMINDER_CHANNEL_NAME = 'Task reminders';
export const REMINDER_SYNC_REASONS = [
  'app_start',
  'app_foreground',
  'manual',
  'reminder_created',
  'reminder_completed',
  'reminder_snoozed',
  'reminder_cancelled',
  'stress_seed',
  'clear_all',
  'action_drain',
] as const;
export type ReminderSyncReason = (typeof REMINDER_SYNC_REASONS)[number];
