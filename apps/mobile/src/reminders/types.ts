/** M4 reminder contracts shared by the SQLite repository, native bridge, and UI. */

export const REMINDER_STATUSES = ['scheduled', 'completed', 'cancelled'] as const;
export type ReminderStatus = (typeof REMINDER_STATUSES)[number];

export const REMINDER_SCHEDULE_STATES = [
  'pending',
  'exact',
  'inexact',
  'exact-overdue',
  'inexact-overdue',
  'deferred-cap',
  'error',
  'delivered-active',
  'blocked-notification-permission',
  'blocked-notification-channel',
  'fired',
  'completed',
  'cancelled',
  'cache-miss',
] as const;
export type ReminderScheduleState = (typeof REMINDER_SCHEDULE_STATES)[number];

export type NotificationPermission = 'granted' | 'denied' | 'notDetermined';
export type ExactAlarmState = 'granted' | 'denied' | 'notApplicable';

export interface NativeNotificationState {
  readonly notificationPermission: NotificationPermission;
  readonly appNotificationsEnabled: boolean;
  readonly channelExists: boolean;
  readonly channelImportance: number;
  readonly channelBlocked: boolean;
  readonly exactAlarm: ExactAlarmState;
  readonly exactAlarmSupported: boolean;
  readonly batteryOptimizationIgnored: boolean;
  readonly powerSaveMode: boolean;
  readonly deviceIdleMode: boolean;
  readonly sdkInt: number;
}

export type NativeDelivery = 'posted' | 'permission_denied' | 'channel_blocked' | 'error';

export interface NativeReminderInput {
  readonly id: string;
  readonly requestCode: number;
  readonly title: string;
  readonly body: string;
  /** Epoch milliseconds (UTC). */
  readonly triggerAt: number;
  readonly status: ReminderStatus;
  /**
   * Floating wall time. When present, native receivers can rebuild `triggerAt`
   * after a time-zone change without JavaScript. Null for absolute snoozes.
   */
  readonly localDate?: string | null;
  readonly localTime?: string | null;
  readonly timezone?: string;
}

export interface NativeScheduleResult {
  readonly id: string;
  readonly requestCode: number;
  readonly state: ReminderScheduleState;
  readonly reason: string | null;
  readonly scheduledFor: number | null;
  readonly notificationActive: boolean;
}

export interface NativeReconcileResult {
  readonly reconciledAt: number;
  readonly cap: number;
  readonly scheduledCount: number;
  readonly exactCount: number;
  readonly inexactCount: number;
  readonly deferredCount: number;
  readonly errorCount: number;
  readonly results: readonly NativeScheduleResult[];
}

export interface NativeReminderAction {
  readonly actionId: string;
  readonly type: 'complete' | 'snooze';
  readonly reminderId: string;
  readonly requestCode: number;
  readonly occurredAt: number;
  readonly snoozedUntil: number | null;
  readonly title: string;
  readonly body: string;
}

export interface NativeStoredAlarm {
  readonly id: string;
  readonly requestCode: number;
  readonly title: string;
  readonly triggerAt: number;
  readonly status: ReminderStatus;
  readonly scheduleMode: ReminderScheduleState;
  readonly scheduleReason: string | null;
  readonly scheduledAt: number | null;
  readonly lastFiredAt: number | null;
  readonly deliveryState: string | null;
  readonly pendingIntentExists: boolean;
}

export interface NativeReminderDiagnostics {
  readonly generatedAt: number;
  readonly version: string;
  readonly permissions: NativeNotificationState;
  readonly store: {
    readonly count: number;
    readonly exactCount: number;
    readonly inexactCount: number;
    readonly deferredCount: number;
    readonly errorCount: number;
    readonly deliveredCount: number;
    readonly blockedCount: number;
    readonly cap: number;
    readonly lastReconciledAt: number | null;
    readonly lastReconcileReason: string | null;
    readonly lastRescheduleAt: number | null;
    readonly lastRescheduleReason: string | null;
    readonly entries: readonly NativeStoredAlarm[];
  };
  readonly queue: {
    readonly pendingCount: number;
    readonly actions: readonly {
      readonly actionId: string;
      readonly type: string;
      readonly reminderId: string;
      readonly occurredAt: number;
    }[];
  };
}

/** Canonical SQLite record. */
export interface Reminder {
  readonly id: string;
  readonly taskId: string | null;
  readonly title: string;
  readonly body: string;
  readonly triggerAt: number;
  readonly status: ReminderStatus;
  readonly requestCode: number;
  readonly scheduleState: ReminderScheduleState;
  readonly scheduleReason: string | null;
  readonly snoozeUntil: number | null;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly completedAt: number | null;
}

export interface ReminderDraft {
  readonly title: string;
  readonly body?: string;
  readonly triggerAt: number;
  readonly taskId?: string;
}

export type ReminderIssueSeverity = 'error' | 'warning' | 'info';

export type ReminderIssueCode =
  | 'notificationsNotDetermined'
  | 'notificationsDenied'
  | 'appNotificationsDisabled'
  | 'channelBlocked'
  | 'channelMissing'
  | 'exactAlarmDenied'
  | 'pendingAlarmCap'
  | 'alarmScheduleErrors'
  | 'deliveryBlocked'
  | 'pendingNativeActions'
  | 'batterySaverActive'
  | 'deviceIdleActive'
  | 'batteryOptimizationAllowed'
  | 'cacheDrift'
  | 'noScheduledReminders';

export interface ReminderIssue {
  readonly code: ReminderIssueCode;
  readonly severity: ReminderIssueSeverity;
}

export interface ReminderSnapshot {
  readonly reminders: readonly Reminder[];
  readonly notificationState: NativeNotificationState;
  readonly lastSync: NativeReconcileResult | null;
  readonly issues: readonly ReminderIssue[];
}

export interface ReminderDiagnostics {
  readonly native: NativeReminderDiagnostics;
  readonly reminders: readonly Reminder[];
  readonly activeCount: number;
  readonly missingFromCache: readonly string[];
  readonly extraInCache: readonly string[];
  readonly issues: readonly ReminderIssue[];
}
