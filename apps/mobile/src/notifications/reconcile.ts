import { AppError } from '@/core/errors/AppError';

import { allocateRequestCode } from '@/reminders/policy';
import {
  addLocalMinutes,
  addDays,
  localDateInZone,
  parseCivilTime,
  resolveLocalDateTime,
} from '@/recurrence/time';

import type {
  NativeActionLike,
  NotificationScheduleRecord,
  NotificationSettings,
  PlannedSchedule,
  ReconcileInput,
  ReconcilePlan,
  ReminderDefinition,
} from './types';
import type { Task } from '@/tasks/types';

interface TriggerWallTime {
  readonly date: string;
  readonly time: string;
}

function isActionable(task: Task): boolean {
  return (
    task.deletedAt === null &&
    task.archivedAt === null &&
    task.status !== 'done' &&
    task.status !== 'cancelled'
  );
}

function clampText(value: string, length: number): string {
  return value.length <= length ? value : value.slice(0, length);
}

function quietHoursAdjustment(
  wall: TriggerWallTime,
  settings: NotificationSettings,
): { readonly wall: TriggerWallTime; readonly reason: string } | null {
  if (!settings.quietHoursEnabled) return null;
  const start = parseCivilTime(settings.quietHoursStart);
  const end = parseCivilTime(settings.quietHoursEnd);
  const current = parseCivilTime(wall.time);
  if (start === null || end === null || current === null) return null;
  const startMinutes = start.hour * 60 + start.minute;
  const endMinutes = end.hour * 60 + end.minute;
  const currentMinutes = current.hour * 60 + current.minute;
  if (startMinutes === endMinutes) return null;

  const inQuietHours =
    startMinutes < endMinutes
      ? currentMinutes >= startMinutes && currentMinutes < endMinutes
      : currentMinutes >= startMinutes || currentMinutes < endMinutes;
  if (!inQuietHours) return null;

  const minutesUntilEnd =
    startMinutes < endMinutes
      ? endMinutes - currentMinutes
      : currentMinutes >= startMinutes
        ? 24 * 60 - currentMinutes + endMinutes
        : endMinutes - currentMinutes;
  return {
    wall: addLocalMinutes(wall.date, wall.time, minutesUntilEnd),
    reason: 'quiet-hours-deferred',
  };
}

function occurrenceTime(
  reminder: ReminderDefinition,
  occurrenceDate: string,
  occurrenceTimeValue: string | null,
  reminderTask: Task,
  settings: NotificationSettings,
): TriggerWallTime {
  const taskTime = occurrenceTimeValue ?? reminderTask.dueTime ?? settings.defaultReminderTime;
  if (reminder.kind === 'absolute' && reminder.localTime !== null) {
    return { date: occurrenceDate, time: reminder.localTime };
  }
  const shifted = addLocalMinutes(occurrenceDate, taskTime, reminder.offsetMinutes);
  return shifted;
}

function singleReminderWallTime(
  reminder: ReminderDefinition,
  reminderTask: Task,
  settings: NotificationSettings,
): TriggerWallTime | null {
  if (reminder.kind === 'absolute') {
    const date = reminder.localDate ?? reminderTask.dueDate;
    const time =
      reminder.localTime ??
      reminderTask.dueTime ??
      (date === null ? null : settings.defaultReminderTime);
    return date === null || time === null ? null : { date, time };
  }
  if (reminderTask.dueDate === null) {
    return reminder.localDate === null || reminder.localTime === null
      ? null
      : { date: reminder.localDate, time: reminder.localTime };
  }
  return addLocalMinutes(
    reminderTask.dueDate,
    reminderTask.dueTime ?? settings.defaultReminderTime,
    reminder.offsetMinutes,
  );
}

function dedupeKey(reminderId: string, occurrenceId: string | null, wall: TriggerWallTime): string {
  return `${reminderId}|${occurrenceId ?? 'single'}|${wall.date}|${wall.time}`;
}

/** FNV-1a 64-bit style hash for deterministic, URI-safe schedule ids. */
export function stableScheduleId(key: string): string {
  let hashA = 0x811c9dc5;
  let hashB = 0x01000193;
  for (let index = 0; index < key.length; index += 1) {
    const code = key.charCodeAt(index);
    hashA ^= code;
    hashA = Math.imul(hashA, 0x01000193) >>> 0;
    hashB ^= code + index;
    hashB = Math.imul(hashB, 0x85ebca6b) >>> 0;
  }
  return `schedule_${hashA.toString(16).padStart(8, '0')}${hashB.toString(16).padStart(8, '0')}`;
}

/**
 * A logical trigger is delivered when the attempt that was posted is at least
 * the current attempt. `trigger_seq` only advances on an explicit snooze, so a
 * recomputed wall time (quiet hours, time zone, clock change) can never make a
 * delivered trigger look pending again.
 */
export function isScheduleDelivered(triggerSeq: number, deliveredSeq: number): boolean {
  return triggerSeq > 0 && deliveredSeq >= triggerSeq;
}

function existingForKey(
  existingByKey: ReadonlyMap<string, NotificationScheduleRecord>,
  key: string,
): NotificationScheduleRecord | null {
  const row = existingByKey.get(key);
  if (row === undefined) return null;
  return row.status === 'scheduled' || row.status === 'fired' ? row : null;
}

/**
 * Pure schedule projection. SQLite remains authoritative; this function decides
 * which concrete occurrences need an alarm and how they map to native request
 * codes. It never touches Android or the database.
 */
export function buildReconcilePlan(input: ReconcileInput): ReconcilePlan {
  const { now, settings, reminders, occurrences, existing } = input;
  const taskById = new Map(input.tasks.map(task => [task.id, task]));
  const occurrencesBySeries = new Map<string, typeof occurrences>();
  for (const occurrence of occurrences) {
    const occurrenceTask = taskById.get(occurrence.taskId);
    if (occurrenceTask?.seriesId === null || occurrenceTask?.seriesId === undefined) continue;
    const list = occurrencesBySeries.get(occurrenceTask.seriesId) ?? [];
    occurrencesBySeries.set(occurrenceTask.seriesId, [...list, occurrence]);
  }

  const today = localDateInZone(now, settings.timezone);
  const horizonEnd = addDays(today, settings.recurrenceHorizonDays);
  const existingByKey = new Map(existing.map(row => [row.dedupeKey, row]));
  const existingCodes = existing.map(row => row.requestCode);

  interface Draft {
    readonly reminder: ReminderDefinition;
    readonly task: Task;
    readonly occurrenceId: string | null;
    readonly wall: TriggerWallTime;
    readonly dedupeKey: string;
    readonly snoozedUntil: number | null;
    readonly reason: string | null;
  }

  const drafts: Draft[] = [];

  for (const reminder of reminders) {
    if (reminder.status !== 'scheduled') continue;
    const reminderTask = taskById.get(reminder.taskId);
    if (reminderTask === undefined || !isActionable(reminderTask)) continue;

    if (reminderTask.isRecurrenceTemplate) {
      const seriesOccurrences = (occurrencesBySeries.get(reminderTask.id) ?? [])
        .filter(occurrence => occurrence.status === 'pending')
        .map(occurrence => ({
          occurrence,
          task: taskById.get(occurrence.taskId) ?? null,
        }))
        .filter(
          (entry): entry is { occurrence: (typeof occurrences)[number]; task: Task } =>
            entry.task !== null && isActionable(entry.task),
        )
        .filter(entry => entry.occurrence.occurrenceDate >= today)
        .filter(entry => entry.occurrence.occurrenceDate <= horizonEnd)
        .sort((left, right) =>
          left.occurrence.occurrenceDate === right.occurrence.occurrenceDate
            ? left.occurrence.id.localeCompare(right.occurrence.id)
            : left.occurrence.occurrenceDate.localeCompare(right.occurrence.occurrenceDate),
        )
        .slice(0, settings.recurrenceHorizonCount);

      for (const entry of seriesOccurrences) {
        const wall = occurrenceTime(
          reminder,
          entry.occurrence.occurrenceDate,
          entry.occurrence.occurrenceTime,
          entry.task,
          settings,
        );
        const quiet = quietHoursAdjustment(wall, settings);
        drafts.push({
          reminder,
          task: entry.task,
          occurrenceId: entry.occurrence.id,
          wall: quiet?.wall ?? wall,
          dedupeKey: dedupeKey(reminder.id, entry.occurrence.id, wall),
          snoozedUntil: null,
          reason: quiet?.reason ?? null,
        });
      }
      continue;
    }

    const wall = singleReminderWallTime(reminder, reminderTask, settings);
    if (wall === null) continue;
    const quiet = quietHoursAdjustment(wall, settings);
    drafts.push({
      reminder,
      task: reminderTask,
      occurrenceId: null,
      wall: quiet?.wall ?? wall,
      dedupeKey: dedupeKey(reminder.id, null, wall),
      snoozedUntil: null,
      reason: quiet?.reason ?? null,
    });
  }

  // Apply an active snooze after quiet hours so the explicit user action wins.
  const withSnooze = drafts.map(draft => {
    const existingRow = existingForKey(existingByKey, draft.dedupeKey);
    if (existingRow?.snoozedUntil !== null && existingRow?.snoozedUntil !== undefined) {
      if (existingRow.snoozedUntil > now) {
        return { ...draft, snoozedUntil: existingRow.snoozedUntil };
      }
    }
    return draft;
  });

  const sortedDrafts = [...withSnooze].sort((left, right) => {
    const leftAt =
      left.snoozedUntil ??
      resolveLocalDateTime(left.wall.date, left.wall.time, settings.timezone).millis;
    const rightAt =
      right.snoozedUntil ??
      resolveLocalDateTime(right.wall.date, right.wall.time, settings.timezone).millis;
    if (leftAt !== rightAt) return leftAt - rightAt;
    return left.dedupeKey.localeCompare(right.dedupeKey);
  });

  const usedCodes = new Set<number>();
  const pending: PlannedSchedule[] = [];
  const delivered: PlannedSchedule[] = [];

  for (const draft of sortedDrafts) {
    const existingRow = existingForKey(existingByKey, draft.dedupeKey);
    let requestCode = existingRow?.requestCode ?? 0;
    if (requestCode === 0) {
      requestCode = allocateRequestCode([...existingCodes, ...usedCodes]);
    }
    usedCodes.add(requestCode);

    const scheduledAt =
      draft.snoozedUntil ??
      resolveLocalDateTime(draft.wall.date, draft.wall.time, settings.timezone).millis;
    const title = clampText(draft.task.title, 500);
    const body = clampText(
      [draft.reminder.label, draft.task.notes].filter(part => part.trim().length > 0).join(' · '),
      500,
    );
    const triggerSeq = existingRow?.triggerSeq ?? 1;
    const deliveredSeq = existingRow?.deliveredSeq ?? 0;
    const dismissedSeq = existingRow?.dismissedSeq ?? 0;
    const dismissedAt = existingRow?.dismissedAt ?? null;
    const alreadyDelivered = isScheduleDelivered(triggerSeq, deliveredSeq);
    const schedule: PlannedSchedule = {
      id: existingRow?.id ?? stableScheduleId(draft.dedupeKey),
      reminderId: draft.reminder.id,
      taskId: draft.task.id,
      occurrenceId: draft.occurrenceId,
      dedupeKey: draft.dedupeKey,
      localDate: draft.wall.date,
      localTime: draft.wall.time,
      timezone: settings.timezone,
      scheduledAt,
      snoozedUntil: draft.snoozedUntil,
      requestCode,
      isExactRequested: draft.reminder.isExact,
      state: alreadyDelivered ? 'delivered' : 'pending',
      reason: alreadyDelivered
        ? 'already-delivered'
        : draft.snoozedUntil === null
          ? draft.reason
          : (draft.reason ?? 'snoozed-from-notification'),
      status: alreadyDelivered ? 'fired' : 'scheduled',
      lastFiredAt: existingRow?.lastFiredAt ?? null,
      triggerSeq,
      deliveredSeq,
      dismissedSeq,
      dismissedAt,
      title,
      body,
      createdAt: existingRow?.createdAt ?? now,
      updatedAt: now,
    };
    if (alreadyDelivered) {
      delivered.push(schedule);
    } else {
      pending.push(schedule);
    }
  }

  const cap = Math.max(1, settings.maxPendingAlarms);
  // Only pending attempts consume capacity; delivered history never does.
  const desired = pending.slice(0, cap);
  const overflow = pending.slice(cap).map(schedule => ({
    ...schedule,
    state: 'deferred-cap',
    reason: 'pending-alarm-cap',
  }));

  const liveIds = new Set([...desired, ...overflow, ...delivered].map(schedule => schedule.id));
  const dropped = existing.filter(row => !liveIds.has(row.id));

  return { desired, overflow, delivered, dropped };
}

export function toNativeInput(schedule: PlannedSchedule): {
  readonly id: string;
  readonly requestCode: number;
  readonly title: string;
  readonly body: string;
  readonly triggerAt: number;
  readonly status: 'scheduled';
  readonly localDate: string | null;
  readonly localTime: string | null;
  readonly timezone: string;
  readonly triggerSeq: number;
  readonly deliveredSeq: number;
  readonly dismissedSeq: number;
  readonly dismissedAt: number | null;
} {
  return {
    id: schedule.id,
    requestCode: schedule.requestCode,
    title: schedule.title,
    body: schedule.body,
    triggerAt: schedule.scheduledAt,
    status: 'scheduled',
    // A snooze is an absolute instant; native must not recompute it on a zone change.
    localDate: schedule.snoozedUntil === null ? schedule.localDate : null,
    localTime: schedule.snoozedUntil === null ? schedule.localTime : null,
    timezone: schedule.timezone,
    triggerSeq: schedule.triggerSeq,
    deliveredSeq: schedule.deliveredSeq,
    dismissedSeq: schedule.dismissedSeq,
    dismissedAt: schedule.dismissedAt,
  };
}

export function applyNativeScheduleAction(
  schedule: NotificationScheduleRecord,
  action: NativeActionLike,
  now: number,
  snoozeMinutes: number,
): NotificationScheduleRecord | null {
  if (schedule.id !== action.scheduleId || schedule.requestCode !== action.requestCode) {
    throw new AppError({
      code: 'schedule_action_mismatch',
      category: 'storage',
      message: 'Native action does not match the schedule being updated',
    });
  }

  // A callback for an attempt that has already been superseded must never be
  // applied to the newer attempt. seq 0 is a legacy action without identity.
  const currentAttempt = action.seq <= 0 || action.seq === schedule.triggerSeq;

  if (action.type === 'complete') {
    if (!currentAttempt) return null;
    if (schedule.status === 'completed' || schedule.status === 'cancelled') return null;
    return {
      ...schedule,
      status: 'completed',
      state: 'completed',
      reason: 'completed-from-notification',
      snoozedUntil: null,
      updatedAt: now,
    };
  }

  if (action.type === 'snooze') {
    // A snooze that started the current attempt can be drained after a
    // reconcile already copied `trigger_seq` from the native cache. Apply its
    // absolute time without starting a second attempt, but only while that
    // attempt is still undelivered. Older replays and future seqs are stale.
    const startsNewAttempt = action.seq <= 0 || action.seq === schedule.triggerSeq;
    const completesCurrentAttempt =
      action.seq > 0 &&
      action.seq === schedule.triggerSeq - 1 &&
      schedule.deliveredSeq < schedule.triggerSeq &&
      // A replay of an action that was already persisted is a no-op.
      schedule.snoozedUntil === null;
    if (!startsNewAttempt && !completesCurrentAttempt) return null;
    // A delivered row is persisted as `fired`; only terminal rows are excluded.
    if (schedule.status === 'completed' || schedule.status === 'cancelled') return null;
    // Delivery itself was validated by the native receiver that queued this
    // action; the durable queue is the trusted transport. The seq check above
    // is what rejects stale attempts.
    const fallback = now + Math.max(1, snoozeMinutes) * 60_000;
    const until =
      action.snoozedUntil !== null && action.snoozedUntil > now ? action.snoozedUntil : fallback;
    return {
      ...schedule,
      status: 'scheduled',
      state: 'pending',
      reason: 'snoozed-from-notification',
      scheduledAt: until,
      snoozedUntil: until,
      // The snooze is the only thing that starts a new delivery attempt.
      triggerSeq: startsNewAttempt ? schedule.triggerSeq + 1 : schedule.triggerSeq,
      updatedAt: now,
    };
  }

  if (action.type === 'dismiss') {
    // Dismissal is history, never a scheduling input. It must never complete
    // the task, cancel a recurrence, or suppress a newer attempt.
    if (action.seq <= 0) return null;
    if (action.seq !== schedule.triggerSeq) return null;
    if (schedule.dismissedSeq >= action.seq) return null;
    return {
      ...schedule,
      dismissedSeq: action.seq,
      dismissedAt: now,
      updatedAt: now,
    };
  }

  return null;
}

export function scheduleTitleFromTask(task: Task, reminder: ReminderDefinition): string {
  return clampText(
    [task.title, reminder.label].filter(part => part.trim().length > 0).join(' · '),
    120,
  );
}
