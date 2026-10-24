import { formatTime12Hour } from '@/core/time/formatTime';

import type { ReminderIssueCode, ReminderScheduleState, ReminderStatus } from '../types';

export type ScheduleStateTranslationKey =
  | 'reminders.state.pending'
  | 'reminders.state.exact'
  | 'reminders.state.inexact'
  | 'reminders.state.exactOverdue'
  | 'reminders.state.inexactOverdue'
  | 'reminders.state.deferredCap'
  | 'reminders.state.error'
  | 'reminders.state.deliveredActive'
  | 'reminders.state.blockedNotificationPermission'
  | 'reminders.state.blockedNotificationChannel'
  | 'reminders.state.fired'
  | 'reminders.state.completed'
  | 'reminders.state.cancelled'
  | 'reminders.state.cacheMiss';

const SCHEDULE_STATE_KEYS: Record<ReminderScheduleState, ScheduleStateTranslationKey> = {
  pending: 'reminders.state.pending',
  exact: 'reminders.state.exact',
  inexact: 'reminders.state.inexact',
  'exact-overdue': 'reminders.state.exactOverdue',
  'inexact-overdue': 'reminders.state.inexactOverdue',
  'deferred-cap': 'reminders.state.deferredCap',
  error: 'reminders.state.error',
  'delivered-active': 'reminders.state.deliveredActive',
  'blocked-notification-permission': 'reminders.state.blockedNotificationPermission',
  'blocked-notification-channel': 'reminders.state.blockedNotificationChannel',
  fired: 'reminders.state.fired',
  completed: 'reminders.state.completed',
  cancelled: 'reminders.state.cancelled',
  'cache-miss': 'reminders.state.cacheMiss',
};

export function scheduleStateKey(state: ReminderScheduleState): ScheduleStateTranslationKey {
  return SCHEDULE_STATE_KEYS[state];
}

export function scheduleStateTone(
  state: ReminderScheduleState,
): 'neutral' | 'success' | 'warning' | 'error' | 'info' {
  if (state === 'error' || state.startsWith('blocked-')) return 'error';
  if (state === 'deferred-cap' || state === 'inexact' || state === 'inexact-overdue') {
    return 'warning';
  }
  if (state === 'exact' || state === 'exact-overdue' || state === 'fired') return 'success';
  if (state === 'delivered-active' || state === 'cache-miss') return 'info';
  return 'neutral';
}

export type StatusTranslationKey =
  'reminders.status.scheduled' | 'reminders.status.completed' | 'reminders.status.cancelled';

const STATUS_KEYS: Record<ReminderStatus, StatusTranslationKey> = {
  scheduled: 'reminders.status.scheduled',
  completed: 'reminders.status.completed',
  cancelled: 'reminders.status.cancelled',
};

export function reminderStatusKey(status: ReminderStatus): StatusTranslationKey {
  return STATUS_KEYS[status];
}

export type IssueTranslationKey =
  | 'reminders.issues.notificationsNotDetermined'
  | 'reminders.issues.notificationsDenied'
  | 'reminders.issues.appNotificationsDisabled'
  | 'reminders.issues.channelBlocked'
  | 'reminders.issues.channelMissing'
  | 'reminders.issues.exactAlarmDenied'
  | 'reminders.issues.pendingAlarmCap'
  | 'reminders.issues.alarmScheduleErrors'
  | 'reminders.issues.deliveryBlocked'
  | 'reminders.issues.pendingNativeActions'
  | 'reminders.issues.batterySaverActive'
  | 'reminders.issues.deviceIdleActive'
  | 'reminders.issues.batteryOptimizationAllowed'
  | 'reminders.issues.cacheDrift'
  | 'reminders.issues.noScheduledReminders';

const ISSUE_KEYS: Record<ReminderIssueCode, IssueTranslationKey> = {
  notificationsNotDetermined: 'reminders.issues.notificationsNotDetermined',
  notificationsDenied: 'reminders.issues.notificationsDenied',
  appNotificationsDisabled: 'reminders.issues.appNotificationsDisabled',
  channelBlocked: 'reminders.issues.channelBlocked',
  channelMissing: 'reminders.issues.channelMissing',
  exactAlarmDenied: 'reminders.issues.exactAlarmDenied',
  pendingAlarmCap: 'reminders.issues.pendingAlarmCap',
  alarmScheduleErrors: 'reminders.issues.alarmScheduleErrors',
  deliveryBlocked: 'reminders.issues.deliveryBlocked',
  pendingNativeActions: 'reminders.issues.pendingNativeActions',
  batterySaverActive: 'reminders.issues.batterySaverActive',
  deviceIdleActive: 'reminders.issues.deviceIdleActive',
  batteryOptimizationAllowed: 'reminders.issues.batteryOptimizationAllowed',
  cacheDrift: 'reminders.issues.cacheDrift',
  noScheduledReminders: 'reminders.issues.noScheduledReminders',
};

export function issueKey(code: ReminderIssueCode): IssueTranslationKey {
  return ISSUE_KEYS[code];
}

export type DeliveryTranslationKey =
  | 'reminders.delivery.posted'
  | 'reminders.delivery.permission_denied'
  | 'reminders.delivery.channel_blocked'
  | 'reminders.delivery.error';

export function deliveryKey(delivery: string): DeliveryTranslationKey {
  if (delivery === 'posted') return 'reminders.delivery.posted';
  if (delivery === 'permission_denied') return 'reminders.delivery.permission_denied';
  if (delivery === 'channel_blocked') return 'reminders.delivery.channel_blocked';
  return 'reminders.delivery.error';
}

/** Example: `Mon, Oct 24 · 9:05 AM`. */
export function formatReminderTrigger(triggerAt: number): string {
  const date = new Date(triggerAt);
  const day = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date);
  return `${day} · ${formatTime12Hour(date)}`;
}

export function formatOptionalTimestamp(timestamp: number | null): string | null {
  if (timestamp === null) return null;
  return formatReminderTrigger(timestamp);
}

export function formatBoolean(value: boolean, yes: string, no: string): string {
  return value ? yes : no;
}

export function formatChannelImportance(
  importance: number,
  labels: {
    readonly high: string;
    readonly default: string;
    readonly low: string;
    readonly min: string;
    readonly none: string;
    readonly unknown: string;
  },
): string {
  if (importance === 5) return labels.high;
  if (importance === 4) return labels.high;
  if (importance === 3) return labels.default;
  if (importance === 2) return labels.low;
  if (importance === 1) return labels.min;
  if (importance === 0) return labels.none;
  return labels.unknown;
}
