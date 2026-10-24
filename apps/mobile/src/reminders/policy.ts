import { AppError } from '@/core/errors/AppError';

import { DEFAULT_SNOOZE_MINUTES, MAX_PENDING_ALARMS, MAX_REQUEST_CODE } from './constants';
import type {
  NativeReminderDiagnostics,
  NativeNotificationState,
  Reminder,
  ReminderDraft,
  ReminderIssue,
  ReminderStatus,
} from './types';

export interface SchedulableItem {
  readonly id: string;
  readonly triggerAt: number;
}

export function isValidRequestCode(requestCode: number): boolean {
  return Number.isInteger(requestCode) && requestCode >= 1 && requestCode <= MAX_REQUEST_CODE;
}

export function isTerminalStatus(status: ReminderStatus): boolean {
  return status === 'completed' || status === 'cancelled';
}

/**
 * Mirrors the native 200-alarm cap. SQLite may hold more active reminders; the
 * overflow is persisted and surfaced rather than silently dropped.
 */
export function selectSchedulable<T extends SchedulableItem>(
  reminders: readonly T[],
  cap: number = MAX_PENDING_ALARMS,
): { readonly kept: readonly T[]; readonly overflow: readonly T[] } {
  const sorted = [...reminders].sort((left, right) => {
    if (left.triggerAt !== right.triggerAt) {
      return left.triggerAt - right.triggerAt;
    }
    return left.id.localeCompare(right.id);
  });
  return {
    kept: sorted.slice(0, Math.max(0, cap)),
    overflow: sorted.slice(Math.max(0, cap)),
  };
}

/** Deterministic gap-filling allocator. Stable across restarts. */
export function allocateRequestCode(usedCodes: Iterable<number>): number {
  const used = new Set<number>();
  for (const code of usedCodes) {
    if (isValidRequestCode(code)) {
      used.add(code);
    }
  }
  for (let candidate = 1; candidate <= MAX_REQUEST_CODE; candidate += 1) {
    if (!used.has(candidate)) {
      return candidate;
    }
  }
  throw new AppError({
    code: 'reminder_request_codes_exhausted',
    category: 'storage',
    message: 'No reminder request codes remain',
  });
}

export function computeSnoozeUntil(now: number, minutes: number = DEFAULT_SNOOZE_MINUTES): number {
  return now + Math.max(1, minutes) * 60_000;
}

export function validateReminderDraft(draft: ReminderDraft): ReminderDraft {
  const title = draft.title.trim();
  const body = (draft.body ?? '').trim();
  if (title.length === 0) {
    throw new AppError({
      code: 'reminder_title_required',
      category: 'validation',
      message: 'A reminder title is required',
    });
  }
  if (title.length > 120) {
    throw new AppError({
      code: 'reminder_title_too_long',
      category: 'validation',
      message: 'Reminder titles cannot exceed 120 characters',
    });
  }
  if (body.length > 500) {
    throw new AppError({
      code: 'reminder_body_too_long',
      category: 'validation',
      message: 'Reminder bodies cannot exceed 500 characters',
    });
  }
  if (!Number.isFinite(draft.triggerAt) || draft.triggerAt <= 0) {
    throw new AppError({
      code: 'reminder_trigger_invalid',
      category: 'validation',
      message: 'Reminder triggerAt must be a positive epoch timestamp',
    });
  }
  const taskId = draft.taskId?.trim();
  return {
    title,
    body,
    triggerAt: Math.trunc(draft.triggerAt),
    ...(taskId !== undefined && taskId.length > 0 ? { taskId } : {}),
  };
}

export interface IssueInput {
  readonly notificationState: NativeNotificationState;
  readonly native: NativeReminderDiagnostics;
  readonly activeReminderIds: readonly string[];
  readonly pendingActionCount: number;
}

export function deriveReminderIssues(input: IssueInput): readonly ReminderIssue[] {
  const { notificationState, native } = input;
  const issues: ReminderIssue[] = [];

  if (notificationState.notificationPermission === 'notDetermined') {
    issues.push({ code: 'notificationsNotDetermined', severity: 'warning' });
  } else if (notificationState.notificationPermission === 'denied') {
    issues.push({ code: 'notificationsDenied', severity: 'error' });
  } else if (!notificationState.appNotificationsEnabled) {
    issues.push({ code: 'appNotificationsDisabled', severity: 'error' });
  }

  if (!notificationState.channelExists) {
    issues.push({ code: 'channelMissing', severity: 'warning' });
  } else if (notificationState.channelBlocked) {
    issues.push({ code: 'channelBlocked', severity: 'error' });
  }

  if (notificationState.exactAlarm === 'denied') {
    issues.push({ code: 'exactAlarmDenied', severity: 'warning' });
  }

  if (native.store.deferredCount > 0) {
    issues.push({ code: 'pendingAlarmCap', severity: 'warning' });
  }
  if (native.store.errorCount > 0) {
    issues.push({ code: 'alarmScheduleErrors', severity: 'error' });
  }
  if (native.store.blockedCount > 0) {
    issues.push({ code: 'deliveryBlocked', severity: 'error' });
  }
  if (input.pendingActionCount > 0) {
    issues.push({ code: 'pendingNativeActions', severity: 'info' });
  }

  const activeIds = new Set(input.activeReminderIds);
  const cachedIds = new Set(
    native.store.entries.filter(entry => entry.status === 'scheduled').map(entry => entry.id),
  );
  const drift =
    input.activeReminderIds.some(id => !cachedIds.has(id)) ||
    [...cachedIds].some(id => !activeIds.has(id));
  if (drift) {
    issues.push({ code: 'cacheDrift', severity: 'error' });
  }

  if (notificationState.powerSaveMode) {
    issues.push({ code: 'batterySaverActive', severity: 'info' });
  }
  if (notificationState.deviceIdleMode) {
    issues.push({ code: 'deviceIdleActive', severity: 'info' });
  }
  if (!notificationState.batteryOptimizationIgnored) {
    issues.push({ code: 'batteryOptimizationAllowed', severity: 'info' });
  }
  if (input.activeReminderIds.length === 0) {
    issues.push({ code: 'noScheduledReminders', severity: 'info' });
  }

  return issues;
}

export function activeReminderIds(reminders: readonly Reminder[]): readonly string[] {
  return reminders.filter(reminder => reminder.status === 'scheduled').map(reminder => reminder.id);
}
