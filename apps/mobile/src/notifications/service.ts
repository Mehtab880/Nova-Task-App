import { AppError } from '@/core/errors/AppError';
import { createEntityId } from '@/core/ids/ulid';
import { systemClock } from '@/core/time/Clock';
import { m5Read, m5Transaction } from '@/db/m5';
import { materializeRule } from '@/recurrence/materialize';
import { listPendingOccurrences, listRules } from '@/recurrence/repository';
import { localDateInZone } from '@/recurrence/time';
import {
  createNovaRemindersBridge,
  isNovaRemindersAvailable,
  type NovaRemindersBridge,
} from '@/reminders/bridge';
import type {
  NativeNotificationState,
  NativeReconcileResult,
  NativeReminderAction,
  NativeReminderInput,
} from '@/reminders/types';
import { completeTaskInDb } from '@/tasks/service';
import { listSeriesTemplateTasks, listAllTasks } from '@/tasks/repository';

import { applyNativeScheduleAction, buildReconcilePlan, toNativeInput } from './reconcile';
import {
  deleteSchedule,
  findSchedule,
  insertReminderEvent,
  listReminders,
  listSchedules,
  readSettings,
  updateScheduleRow,
  upsertSchedule,
  writeSetting,
} from './repository';
import type {
  NotificationScheduleRecord,
  NotificationSettings,
  PlannedSchedule,
  ReconcilePlan,
} from './types';

export interface NotificationRuntimePort {
  getNotificationState(): Promise<NativeNotificationState>;
  reconcile(
    reminders: readonly NativeReminderInput[],
    reason: string,
  ): Promise<NativeReconcileResult>;
  drainActions(): Promise<readonly NativeReminderAction[]>;
  acknowledgeActions(actionIds: readonly string[]): Promise<number>;
}

let cachedBridge: NovaRemindersBridge | null = null;

function bridge(): NovaRemindersBridge {
  cachedBridge ??= createNovaRemindersBridge();
  return cachedBridge;
}

export const bridgePort: NotificationRuntimePort = {
  getNotificationState: () => bridge().getNotificationState(),
  reconcile: (reminders, reason) => bridge().reconcile(reminders, reason),
  drainActions: () => bridge().drainActions(),
  acknowledgeActions: ids => bridge().acknowledgeActions(ids),
};

export function availablePort(): NotificationRuntimePort | null {
  if (process.env.NODE_ENV === 'test') return null;
  return isNovaRemindersAvailable() ? bridgePort : null;
}

export interface ReconcileReport {
  readonly reason: string;
  readonly reconciledAt: number;
  readonly desiredCount: number;
  readonly overflowCount: number;
  readonly droppedCount: number;
  readonly materialized: number;
  readonly native: NativeReconcileResult | null;
}

let reconcileChain: Promise<unknown> = Promise.resolve();

/**
 * Serializes reconciliation so two foreground transitions cannot race and
 * schedule the same request code twice.
 */
export function reconcileNotifications(
  reason: string,
  port: NotificationRuntimePort | null = availablePort(),
): Promise<ReconcileReport> {
  const run = reconcileChain.then(
    () => runReconcile(reason, port),
    () => runReconcile(reason, port),
  );
  reconcileChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function materializeActiveSeries(now: number): Promise<number> {
  return m5Transaction(async db => {
    const settings = await readSettings(db);
    const templates = new Map((await listSeriesTemplateTasks(db)).map(task => [task.id, task]));
    const rules = await listRules(db);
    let materialized = 0;
    const today = localDateInZone(now, settings.timezone);
    for (const rule of rules) {
      if (!rule.isActive) continue;
      const template = templates.get(rule.taskId);
      if (template === undefined) continue;
      materialized += await materializeRule(db, rule, template, {
        now,
        today,
        horizonDays: settings.recurrenceHorizonDays,
        timeZone: settings.timezone,
      });
    }
    return materialized;
  });
}

interface ProjectionInput {
  readonly settings: NotificationSettings;
  readonly plan: ReconcilePlan;
}

async function persistPlan(plan: ReconcilePlan): Promise<ProjectionInput> {
  return m5Transaction(async db => {
    const settings = await readSettings(db);
    for (const row of plan.dropped) {
      await deleteSchedule(db, row.id);
    }
    const all: readonly PlannedSchedule[] = [
      ...plan.desired,
      ...plan.overflow,
      // Delivered rows are persisted so delivery history and request-code
      // reservations survive, but they are never re-armed or capped.
      ...plan.delivered,
    ];
    for (const row of all) {
      await upsertSchedule(db, row);
    }
    return { settings, plan };
  });
}

async function projectAndPersist(now: number): Promise<ProjectionInput & { materialized: number }> {
  const materialized = await materializeActiveSeries(now);
  const plan = await m5Read(async db => {
    const settings = await readSettings(db);
    const tasks = await listAllTasks(db);
    const reminders = await listReminders(db);
    const occurrences = await listPendingOccurrences(db);
    const existing = await listSchedules(db);
    return buildReconcilePlan({ now, settings, tasks, reminders, occurrences, existing });
  });
  const persisted = await persistPlan(plan);
  return { ...persisted, materialized };
}

async function persistNativeResult(
  native: NativeReconcileResult,
  reason: string,
  state: NativeNotificationState | null,
): Promise<void> {
  await m5Transaction(async db => {
    const now = native.reconciledAt;
    for (const result of native.results) {
      const row = await findSchedule(db, result.id);
      if (row === null) continue;
      // Delivery is only recorded from what the native receiver actually
      // posted; `state = exact/inexact` only means scheduling succeeded.
      await db.execute(
        `UPDATE notification_schedule SET
          state = ?, reason = ?,
          scheduled_at = COALESCE(?, scheduled_at),
          trigger_seq = MAX(trigger_seq, ?),
          delivered_seq = MAX(delivered_seq, ?),
          dismissed_seq = MAX(dismissed_seq, ?),
          dismissed_at = COALESCE(dismissed_at, ?),
          last_fired_at = COALESCE(?, last_fired_at),
          status = CASE WHEN ? > 0 AND ? >= MAX(trigger_seq, ?) THEN 'fired' ELSE status END,
          updated_at = ?
        WHERE id = ?`,
        [
          result.state,
          result.reason,
          result.scheduledFor,
          result.triggerSeq,
          result.deliveredSeq,
          result.dismissedSeq,
          result.dismissedAt,
          result.lastFiredAt,
          result.deliveredSeq,
          result.deliveredSeq,
          result.triggerSeq,
          now,
          result.id,
        ],
      );
    }
    await writeSetting(db, 'last_reconcile_at', String(now), now);
    await writeSetting(db, 'last_reconcile_reason', reason, now);
    await writeSetting(db, 'last_reconcile_scheduled', String(native.scheduledCount), now);
    await writeSetting(db, 'last_reconcile_deferred', String(native.deferredCount), now);
    await writeSetting(db, 'last_reconcile_errors', String(native.errorCount), now);
    if (state !== null) {
      await writeSetting(db, 'native_notification_permission', state.notificationPermission, now);
      await writeSetting(db, 'native_exact_alarm', state.exactAlarm, now);
    }
  });
}

async function runReconcile(
  reason: string,
  port: NotificationRuntimePort | null,
): Promise<ReconcileReport> {
  const now = systemClock.now().getTime();
  const projected = await projectAndPersist(now);
  const settings = projected.settings;

  if (port === null) {
    return {
      reason,
      reconciledAt: now,
      desiredCount: projected.plan.desired.length,
      overflowCount: projected.plan.overflow.length,
      droppedCount: projected.plan.dropped.length,
      materialized: projected.materialized,
      native: null,
    };
  }

  const [state, native] = await Promise.all([
    port.getNotificationState().catch(() => null),
    port.reconcile(
      [...projected.plan.desired, ...projected.plan.delivered].map(toNativeInput),
      reason,
    ),
  ]);
  await persistNativeResult(native, reason, state);

  // Cap overflow is a projection concern; native only ever sees `desired`.
  void settings;
  return {
    reason,
    reconciledAt: now,
    desiredCount: projected.plan.desired.length,
    overflowCount: projected.plan.overflow.length,
    droppedCount: projected.plan.dropped.length,
    materialized: projected.materialized,
    native,
  };
}

export interface ActionDrainReport {
  readonly drained: number;
  readonly applied: number;
  readonly acknowledged: number;
  readonly failed: number;
}

function actionToScheduleAction(action: NativeReminderAction): {
  actionId: string;
  type: string;
  scheduleId: string;
  requestCode: number;
  snoozedUntil: number | null;
  seq: number;
} {
  return {
    actionId: action.actionId,
    type: action.type,
    // Native alarms are keyed by notification_schedule.id.
    scheduleId: action.reminderId,
    requestCode: action.requestCode,
    snoozedUntil: action.snoozedUntil,
    seq: action.seq,
  };
}

/**
 * Drains user actions taken from notifications. SQLite is updated first; the
 * native queue is acknowledged only after the transaction commits, so a crash
 * mid-way replays the action rather than losing it.
 */
export async function drainNativeActions(
  port: NotificationRuntimePort | null = availablePort(),
): Promise<ActionDrainReport> {
  if (port === null) {
    return { drained: 0, applied: 0, acknowledged: 0, failed: 0 };
  }
  const actions = await port.drainActions();
  if (actions.length === 0) {
    return { drained: 0, applied: 0, acknowledged: 0, failed: 0 };
  }

  const now = systemClock.now().getTime();
  const appliedIds = await m5Transaction(async db => {
    const settings = await readSettings(db);
    const done: string[] = [];
    for (const action of actions) {
      const schedule = await findSchedule(db, action.reminderId);
      if (schedule === null) {
        // The schedule row was already removed; nothing to apply, but the
        // action is safe to acknowledge because it can never be replayed.
        done.push(action.actionId);
        continue;
      }
      const updated = applyNativeScheduleAction(
        schedule,
        actionToScheduleAction(action),
        now,
        settings.snoozeMinutes,
      );
      if (updated === null) {
        done.push(action.actionId);
        continue;
      }
      await updateScheduleRow(db, updated);
      await insertReminderEvent(db, {
        id: createEntityId('event'),
        reminderId: schedule.reminderId,
        scheduleId: schedule.id,
        taskId: schedule.taskId,
        occurrenceId: schedule.occurrenceId,
        type: `notification-${action.type}`,
        detail: '',
        createdAt: now,
      });
      if (action.type === 'complete') {
        await completeTaskInDb(db, schedule.taskId, { now, timeZone: settings.timezone });
      }
      done.push(action.actionId);
    }
    return done;
  });

  const acknowledged = await port.acknowledgeActions(appliedIds);
  await reconcileNotifications('action-drain', port);
  return {
    drained: actions.length,
    applied: appliedIds.length,
    acknowledged,
    failed: actions.length - appliedIds.length,
  };
}

export async function getNativeNotificationState(): Promise<NativeNotificationState | null> {
  const port = availablePort();
  if (port === null) return null;
  try {
    return await port.getNotificationState();
  } catch {
    return null;
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!isNovaRemindersAvailable()) return false;
  const result = await bridge().requestNotificationPermission();
  return result === 'granted';
}

export async function openNotificationSettings(): Promise<boolean> {
  if (!isNovaRemindersAvailable()) return false;
  return bridge().openNotificationSettings();
}

export async function openExactAlarmSettings(): Promise<boolean> {
  if (!isNovaRemindersAvailable()) return false;
  return bridge().openExactAlarmSettings();
}

export async function loadSchedulesForTask(
  taskId: string,
): Promise<readonly NotificationScheduleRecord[]> {
  return m5Read(async db => {
    const rows = await listSchedules(db);
    return rows.filter(row => row.taskId === taskId);
  });
}

export function assertScheduleActionMatches(
  schedule: NotificationScheduleRecord,
  requestCode: number,
): void {
  if (schedule.requestCode !== requestCode) {
    throw new AppError({
      code: 'schedule_action_mismatch',
      category: 'storage',
      message: 'Native action does not match the schedule being updated',
    });
  }
}
