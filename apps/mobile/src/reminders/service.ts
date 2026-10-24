import { AppError } from '@/core/errors/AppError';
import { createEntityId } from '@/core/ids/ulid';
import { logger } from '@/core/logging';
import { systemClock } from '@/core/time/Clock';

import { createNovaRemindersBridge, type NovaRemindersBridge } from './bridge';
import { MAX_PENDING_ALARMS, MAX_REQUEST_CODE } from './constants';
import { applyNativeAction, toNativeInput } from './mappers';
import {
  activeReminderIds,
  computeSnoozeUntil,
  deriveReminderIssues,
  validateReminderDraft,
} from './policy';
import {
  cancelReminderRecord,
  completeReminderRecord,
  deleteAllReminders,
  getReminder,
  insertReminder,
  insertReminders,
  listActiveReminders,
  listReminders,
  saveReminder,
  snoozeReminderRecord,
  updateScheduleStates,
} from './repository';
import type {
  NativeNotificationState,
  NativeReconcileResult,
  NativeReminderDiagnostics,
  NotificationPermission,
  Reminder,
  ReminderDiagnostics,
  ReminderDraft,
  ReminderSnapshot,
} from './types';
import type { ReminderSyncReason } from './constants';

export type { ReminderSyncReason } from './constants';

export interface ReminderSyncResult {
  readonly native: NativeReconcileResult;
  readonly reminders: readonly Reminder[];
  readonly appliedActions: number;
}

let bridge: NovaRemindersBridge | null = null;
let syncInFlight: Promise<ReminderSyncResult> | null = null;

function remindersBridge(): NovaRemindersBridge {
  bridge ??= createNovaRemindersBridge();
  return bridge;
}

function nowMs(): number {
  return systemClock.now().getTime();
}

function wrapNativeError(operation: string, error: unknown): AppError {
  return new AppError({
    code: 'reminder_native_operation_failed',
    category: 'storage',
    message: `NovaReminders ${operation} failed`,
    cause: error,
    retriable: true,
  });
}

async function drainNativeActions(current: NovaRemindersBridge): Promise<number> {
  let actions;
  try {
    actions = await current.drainActions();
  } catch (error) {
    throw wrapNativeError('drainActions', error);
  }
  if (actions.length === 0) return 0;

  const acknowledged: string[] = [];
  for (const action of actions) {
    try {
      const reminder = await getReminder(action.reminderId);
      if (reminder === null) {
        logger.warn('Dropping native reminder action for a deleted reminder', {
          actionId: action.actionId,
          reminderId: action.reminderId,
        });
        acknowledged.push(action.actionId);
        continue;
      }
      const updated = applyNativeAction(reminder, action, nowMs());
      if (updated !== null) {
        await saveReminder(updated);
      }
      acknowledged.push(action.actionId);
    } catch (error) {
      if (error instanceof AppError && error.code === 'reminder_action_mismatch') {
        // A stale receiver action must not poison the queue forever.
        logger.warn('Dropping native reminder action for a changed request code', {
          actionId: action.actionId,
          reminderId: action.reminderId,
        });
        acknowledged.push(action.actionId);
        continue;
      }
      logger.error('Failed to apply a native reminder action; it remains queued', {
        actionId: action.actionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (acknowledged.length > 0) {
    try {
      await current.acknowledgeActions(acknowledged);
    } catch (error) {
      logger.error('Failed to acknowledge native reminder actions', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return acknowledged.length;
}

async function performSync(reason: ReminderSyncReason): Promise<ReminderSyncResult> {
  const current = remindersBridge();
  const appliedActions = await drainNativeActions(current);
  const active = await listActiveReminders();

  let native: NativeReconcileResult;
  try {
    native = await current.reconcile(active.map(toNativeInput), reason);
  } catch (error) {
    throw wrapNativeError('reconcile', error);
  }

  await updateScheduleStates(native.results);
  const reminders = await listReminders();

  logger.info('Reminder reconciliation complete', {
    reason,
    active: active.length,
    scheduled: native.scheduledCount,
    exact: native.exactCount,
    inexact: native.inexactCount,
    deferred: native.deferredCount,
    errors: native.errorCount,
    appliedActions,
  });

  if (native.deferredCount > 0) {
    logger.warn('Reminder alarm cap reached; reminders are deferred but retained', {
      cap: MAX_PENDING_ALARMS,
      deferred: native.deferredCount,
    });
  }
  if (native.errorCount > 0) {
    logger.error('Some reminders could not be scheduled', { errors: native.errorCount });
  }

  return { native, reminders, appliedActions };
}

/**
 * Single-flight reconciliation from SQLite into the native cache/alarm manager.
 * Native user actions are applied to SQLite before the cache is replaced.
 */
export function syncReminders(reason: ReminderSyncReason = 'manual'): Promise<ReminderSyncResult> {
  if (syncInFlight !== null) {
    return syncInFlight;
  }
  const run = performSync(reason).finally(() => {
    syncInFlight = null;
  });
  syncInFlight = run;
  return run;
}

export async function getNotificationState(): Promise<NativeNotificationState> {
  return remindersBridge().getNotificationState();
}

export function requestNotificationPermission(): Promise<NotificationPermission> {
  return remindersBridge().requestNotificationPermission();
}

export function openNotificationSettings(): Promise<boolean> {
  return remindersBridge().openNotificationSettings();
}

export function openExactAlarmSettings(): Promise<boolean> {
  return remindersBridge().openExactAlarmSettings();
}

export async function createReminder(draft: ReminderDraft): Promise<Reminder> {
  const normalized = validateReminderDraft(draft);
  const created = await insertReminder(normalized);
  await syncReminders('reminder_created');
  return created;
}

export interface StressSeedResult {
  readonly created: number;
  readonly sync: ReminderSyncResult;
}

export async function createStressReminders(count = 205): Promise<StressSeedResult> {
  if (!Number.isInteger(count) || count < 1 || count > 1_000) {
    throw new AppError({
      code: 'invalid_stress_reminder_count',
      category: 'validation',
      message: 'Stress reminder count must be between 1 and 1000',
    });
  }
  const now = nowMs();
  const drafts: ReminderDraft[] = Array.from({ length: count }, (_, index) => ({
    title: `M4 cap test ${index + 1}`,
    body: 'Stress fixture for the 200 pending-alarm cap.',
    triggerAt: now + 30_000 + index * 1_000,
  }));
  const created = await insertReminders(drafts);
  const sync = await syncReminders('stress_seed');
  return { created: created.length, sync };
}

export async function completeReminderFromApp(id: string): Promise<void> {
  await completeReminderRecord(id);
  await syncReminders('reminder_completed');
}

export async function snoozeReminderFromApp(id: string, minutes = 10): Promise<void> {
  await snoozeReminderRecord(id, computeSnoozeUntil(nowMs(), minutes));
  await syncReminders('reminder_snoozed');
}

export async function cancelReminderFromApp(id: string): Promise<void> {
  await cancelReminderRecord(id);
  await syncReminders('reminder_cancelled');
}

export async function clearAllReminders(): Promise<void> {
  await deleteAllReminders();
  await syncReminders('clear_all');
}

export async function sendImmediateTestNotification(title: string, body: string): Promise<string> {
  const current = remindersBridge();
  const reminders = await listReminders();
  // Reserve the top of the code range for dev notifications that are not rows.
  // This keeps them away from normal gap-filled SQLite codes.
  const usedCodes = new Set(reminders.map(reminder => reminder.requestCode));
  let requestCode = MAX_REQUEST_CODE;
  while (requestCode > MAX_REQUEST_CODE - 1_000 && usedCodes.has(requestCode)) {
    requestCode -= 1;
  }
  if (requestCode <= MAX_REQUEST_CODE - 1_000) {
    throw new AppError({
      code: 'reminder_test_request_codes_exhausted',
      category: 'storage',
      message: 'No reserved request codes remain for a test notification',
    });
  }
  try {
    const now = nowMs();
    const normalized = validateReminderDraft({ title, body, triggerAt: now });
    return await current.notifyNow({
      id: createEntityId('reminder'),
      requestCode,
      title: normalized.title,
      body: normalized.body ?? '',
      triggerAt: now,
      status: 'scheduled',
    });
  } catch (error) {
    throw wrapNativeError('notifyNow', error);
  }
}

export async function rescheduleFromNativeCache(): Promise<NativeReconcileResult> {
  try {
    return await remindersBridge().rescheduleFromStore('manual_cache_reschedule');
  } catch (error) {
    throw wrapNativeError('rescheduleFromStore', error);
  }
}

export async function getReminderDiagnostics(): Promise<ReminderDiagnostics> {
  let native: NativeReminderDiagnostics;
  try {
    native = await remindersBridge().getDiagnostics();
  } catch (error) {
    throw wrapNativeError('getDiagnostics', error);
  }
  const reminders = await listReminders();
  const activeIds = activeReminderIds(reminders);
  const activeSet = new Set(activeIds);
  const cachedIds = new Set(
    native.store.entries.filter(entry => entry.status === 'scheduled').map(entry => entry.id),
  );
  const missingFromCache = activeIds.filter(id => !cachedIds.has(id));
  const extraInCache = [...cachedIds].filter(id => !activeSet.has(id));
  const issues = deriveReminderIssues({
    notificationState: native.permissions,
    native,
    activeReminderIds: activeIds,
    pendingActionCount: native.queue.pendingCount,
  });

  return {
    native,
    reminders,
    activeCount: activeIds.length,
    missingFromCache,
    extraInCache,
    issues,
  };
}

export async function loadReminderSnapshot(
  reason: ReminderSyncReason = 'manual',
): Promise<ReminderSnapshot> {
  const sync = await syncReminders(reason);
  const diagnostics = await getReminderDiagnostics();
  return {
    reminders: diagnostics.reminders,
    notificationState: diagnostics.native.permissions,
    lastSync: sync.native,
    issues: diagnostics.issues,
  };
}

/** Reads current SQLite/native state without forcing another reconciliation. */
export async function readReminderSnapshot(): Promise<ReminderSnapshot> {
  const diagnostics = await getReminderDiagnostics();
  return {
    reminders: diagnostics.reminders,
    notificationState: diagnostics.native.permissions,
    lastSync: null,
    issues: diagnostics.issues,
  };
}

export async function loadReminderDiagnostics(
  reason: ReminderSyncReason = 'manual',
): Promise<ReminderDiagnostics> {
  await syncReminders(reason);
  return getReminderDiagnostics();
}
