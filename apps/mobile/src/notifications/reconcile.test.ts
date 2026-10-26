import { createTask } from '@/tasks/lifecycle';
import type { Task } from '@/tasks/types';

import {
  applyNativeScheduleAction,
  buildReconcilePlan,
  stableScheduleId,
  toNativeInput,
} from './reconcile';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  type NotificationScheduleRecord,
  type NotificationSettings,
  type RecurrenceOccurrenceRecord,
  type ReminderDefinition,
} from './types';

const NOW = Date.UTC(2026, 2, 1, 12, 0); // 2026-03-01 12:00 UTC

function task(overrides: Partial<Task> = {}): Task {
  return {
    ...createTask(
      {
        title: 'Plan the week',
        notes: 'Focus on M5',
        dueDate: '2026-03-02',
        dueTime: '09:00',
      },
      {
        id: overrides.id ?? 'task_00000000000000000000000001',
        now: NOW,
        timeZone: 'UTC',
        defaultListId: 'list_00000000000000000000000000',
      },
    ),
    ...overrides,
  };
}

function reminder(overrides: Partial<ReminderDefinition> = {}): ReminderDefinition {
  return {
    id: 'reminder_1',
    taskId: 'task_00000000000000000000000001',
    label: '',
    kind: 'relative',
    offsetMinutes: 0,
    localDate: null,
    localTime: null,
    isExact: true,
    status: 'scheduled',
    snoozeUntil: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function settings(overrides: Partial<NotificationSettings> = {}): NotificationSettings {
  return { ...DEFAULT_NOTIFICATION_SETTINGS, timezone: 'UTC', ...overrides };
}

function schedule(overrides: Partial<NotificationScheduleRecord> = {}): NotificationScheduleRecord {
  return {
    id: 'schedule_existing',
    reminderId: 'reminder_1',
    taskId: 'task_00000000000000000000000001',
    occurrenceId: null,
    dedupeKey: 'reminder_1|single|2026-03-02|09:00',
    localDate: '2026-03-02',
    localTime: '09:00',
    timezone: 'UTC',
    scheduledAt: Date.UTC(2026, 2, 2, 9, 0),
    snoozedUntil: null,
    requestCode: 7,
    isExactRequested: true,
    state: 'exact',
    reason: null,
    status: 'scheduled',
    lastFiredAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function occurrence(
  id: string,
  date: string,
  overrides: Partial<RecurrenceOccurrenceRecord> = {},
): RecurrenceOccurrenceRecord {
  return {
    id,
    ruleId: 'rule_1',
    taskId: `occ_task_${id}`,
    occurrenceDate: date,
    occurrenceTime: '09:00',
    status: 'pending',
    ...overrides,
  };
}

describe('notification reconciliation', () => {
  it('projects a relative reminder at the task due time', () => {
    const plan = buildReconcilePlan({
      now: NOW,
      settings: settings(),
      tasks: [task()],
      reminders: [reminder()],
      occurrences: [],
      existing: [],
    });
    expect(plan.desired).toHaveLength(1);
    expect(plan.desired[0]).toEqual(
      expect.objectContaining({
        localDate: '2026-03-02',
        localTime: '09:00',
        scheduledAt: Date.UTC(2026, 2, 2, 9, 0),
        requestCode: 1,
        state: 'pending',
        title: 'Plan the week',
      }),
    );
    expect(plan.desired[0]?.body).toBe('Focus on M5');
  });

  it('applies a negative relative offset across midnight', () => {
    const plan = buildReconcilePlan({
      now: NOW,
      settings: settings(),
      tasks: [task({ dueDate: '2026-03-02', dueTime: '00:05' })],
      reminders: [reminder({ offsetMinutes: -10 })],
      occurrences: [],
      existing: [],
    });
    expect(plan.desired[0]).toEqual(
      expect.objectContaining({ localDate: '2026-03-01', localTime: '23:55' }),
    );
  });

  it('projects an absolute reminder', () => {
    const plan = buildReconcilePlan({
      now: NOW,
      settings: settings(),
      tasks: [task({ dueDate: null, dueTime: null })],
      reminders: [
        reminder({
          kind: 'absolute',
          localDate: '2026-03-05',
          localTime: '17:30',
        }),
      ],
      occurrences: [],
      existing: [],
    });
    expect(plan.desired[0]).toEqual(
      expect.objectContaining({
        localDate: '2026-03-05',
        localTime: '17:30',
        scheduledAt: Date.UTC(2026, 2, 5, 17, 30),
      }),
    );
  });

  it('defers quiet-hours reminders to the end of quiet hours', () => {
    const plan = buildReconcilePlan({
      now: NOW,
      settings: settings({
        quietHoursEnabled: true,
        quietHoursStart: '22:00',
        quietHoursEnd: '07:00',
      }),
      tasks: [task({ dueDate: '2026-03-02', dueTime: '23:00' })],
      reminders: [reminder()],
      occurrences: [],
      existing: [],
    });
    expect(plan.desired[0]).toEqual(
      expect.objectContaining({
        localDate: '2026-03-03',
        localTime: '07:00',
        reason: 'quiet-hours-deferred',
      }),
    );
  });

  it('keeps a reminder outside quiet hours unchanged', () => {
    const plan = buildReconcilePlan({
      now: NOW,
      settings: settings({
        quietHoursEnabled: true,
        quietHoursStart: '22:00',
        quietHoursEnd: '07:00',
      }),
      tasks: [task({ dueDate: '2026-03-02', dueTime: '15:00' })],
      reminders: [reminder()],
      occurrences: [],
      existing: [],
    });
    expect(plan.desired[0]?.reason).toBeNull();
    expect(plan.desired[0]?.localTime).toBe('15:00');
  });

  it('schedules a recurring reminder for the next 10 occurrences within 14 days', () => {
    const template = task({
      id: 'task_series',
      seriesId: null,
      isRecurrenceTemplate: true,
      dueDate: '2026-03-02',
      dueTime: '09:00',
    });
    const occurrences = Array.from({ length: 16 }, (_, index) =>
      occurrence(
        `occ_${String(index + 1).padStart(2, '0')}`,
        `2026-03-${String(index + 2).padStart(2, '0')}`,
      ),
    );
    const occurrenceTasks = occurrences.map((entry, index) =>
      task({
        id: entry.taskId,
        seriesId: template.id,
        occurrenceDate: entry.occurrenceDate,
        dueDate: entry.occurrenceDate,
        dueTime: '09:00',
        title: `Occurrence ${String(index + 1)}`,
      }),
    );
    const plan = buildReconcilePlan({
      now: NOW,
      settings: settings(),
      tasks: [template, ...occurrenceTasks],
      reminders: [reminder({ taskId: template.id })],
      occurrences,
      existing: [],
    });
    expect(plan.desired).toHaveLength(10);
    expect(plan.desired.map(row => row.localDate)).toEqual([
      '2026-03-02',
      '2026-03-03',
      '2026-03-04',
      '2026-03-05',
      '2026-03-06',
      '2026-03-07',
      '2026-03-08',
      '2026-03-09',
      '2026-03-10',
      '2026-03-11',
    ]);
    expect(new Set(plan.desired.map(row => row.requestCode)).size).toBe(10);
  });

  it('excludes occurrences beyond the 14-day horizon', () => {
    const template = task({
      id: 'task_series',
      isRecurrenceTemplate: true,
      dueDate: '2026-03-02',
      dueTime: '09:00',
    });
    const occurrences = [occurrence('occ_1', '2026-03-15'), occurrence('occ_2', '2026-03-16')];
    const occurrenceTasks = occurrences.map(entry =>
      task({
        id: entry.taskId,
        seriesId: template.id,
        occurrenceDate: entry.occurrenceDate,
        dueDate: entry.occurrenceDate,
        dueTime: '09:00',
      }),
    );
    const plan = buildReconcilePlan({
      now: NOW,
      settings: settings(),
      tasks: [template, ...occurrenceTasks],
      reminders: [reminder({ taskId: template.id })],
      occurrences,
      existing: [],
    });
    expect(plan.desired.map(row => row.localDate)).toEqual(['2026-03-15']);
  });

  it('enforces the pending-alarm cap and preserves overflow', () => {
    const tasks: Task[] = [];
    const reminders: ReminderDefinition[] = [];
    for (let index = 0; index < 205; index += 1) {
      const id = `task_${String(index).padStart(3, '0')}`;
      tasks.push(
        task({
          id,
          dueDate: '2026-03-02',
          dueTime: '09:00',
          sortOrder: index,
        }),
      );
      reminders.push(reminder({ id: `reminder_${String(index).padStart(3, '0')}`, taskId: id }));
    }
    const plan = buildReconcilePlan({
      now: NOW,
      settings: settings({ maxPendingAlarms: 200 }),
      tasks,
      reminders,
      occurrences: [],
      existing: [],
    });
    expect(plan.desired).toHaveLength(200);
    expect(plan.overflow).toHaveLength(5);
    expect(plan.overflow.every(row => row.state === 'deferred-cap')).toBe(true);
    expect(plan.overflow[0]?.reason).toBe('pending-alarm-cap');
  });

  it('reuses an existing schedule identity and request code', () => {
    const existing = schedule();
    const plan = buildReconcilePlan({
      now: NOW,
      settings: settings(),
      tasks: [task()],
      reminders: [reminder()],
      occurrences: [],
      existing: [existing],
    });
    expect(plan.desired[0]).toEqual(
      expect.objectContaining({ id: existing.id, requestCode: existing.requestCode }),
    );
    expect(plan.dropped).toHaveLength(0);
  });

  it('drops schedules whose task is completed', () => {
    const plan = buildReconcilePlan({
      now: NOW,
      settings: settings(),
      tasks: [task({ status: 'done', completedAt: NOW })],
      reminders: [reminder()],
      occurrences: [],
      existing: [schedule()],
    });
    expect(plan.desired).toHaveLength(0);
    expect(plan.dropped).toEqual([schedule()]);
  });

  it('preserves an active snooze over the computed wall time', () => {
    const snoozedUntil = NOW + 30 * 60_000;
    const existing = schedule({ snoozedUntil, scheduledAt: snoozedUntil, state: 'pending' });
    const plan = buildReconcilePlan({
      now: NOW,
      settings: settings(),
      tasks: [task()],
      reminders: [reminder()],
      occurrences: [],
      existing: [existing],
    });
    expect(plan.desired[0]).toEqual(
      expect.objectContaining({
        id: existing.id,
        scheduledAt: snoozedUntil,
        snoozedUntil,
        reason: 'snoozed-from-notification',
      }),
    );
  });

  it('resolves DST gaps in the current device zone', () => {
    const plan = buildReconcilePlan({
      now: Date.UTC(2026, 2, 7, 12, 0),
      settings: settings({ timezone: 'America/New_York' }),
      tasks: [task({ dueDate: '2026-03-08', dueTime: '02:30' })],
      reminders: [reminder()],
      occurrences: [],
      existing: [],
    });
    expect(plan.desired[0]?.scheduledAt).toBe(1_772_955_000_000);
  });

  it('produces a native input with floating fields unless snoozed', () => {
    const plan = buildReconcilePlan({
      now: NOW,
      settings: settings(),
      tasks: [task()],
      reminders: [reminder()],
      occurrences: [],
      existing: [],
    });
    expect(toNativeInput(plan.desired[0]!)).toEqual(
      expect.objectContaining({
        localDate: '2026-03-02',
        localTime: '09:00',
        timezone: 'UTC',
        status: 'scheduled',
      }),
    );
    const snoozed = {
      ...plan.desired[0]!,
      snoozedUntil: NOW + 60_000,
      scheduledAt: NOW + 60_000,
    };
    expect(toNativeInput(snoozed)).toEqual(
      expect.objectContaining({ localDate: null, localTime: null }),
    );
  });

  it('creates deterministic URI-safe schedule ids', () => {
    expect(stableScheduleId('a|b|c')).toBe(stableScheduleId('a|b|c'));
    expect(stableScheduleId('a|b|c')).not.toBe(stableScheduleId('a|b|d'));
    expect(stableScheduleId('a|b|c')).toMatch(/^schedule_[0-9a-f]{16}$/);
  });
});

describe('native schedule actions', () => {
  const row = schedule();

  it('completes a schedule', () => {
    const updated = applyNativeScheduleAction(
      row,
      {
        actionId: 'complete-1',
        type: 'complete',
        scheduleId: row.id,
        requestCode: row.requestCode,
        snoozedUntil: null,
      },
      NOW,
      10,
    );
    expect(updated).toEqual(
      expect.objectContaining({
        status: 'completed',
        state: 'completed',
        reason: 'completed-from-notification',
      }),
    );
  });

  it('snoozes a schedule for the native interval', () => {
    const until = NOW + 10 * 60_000;
    const updated = applyNativeScheduleAction(
      row,
      {
        actionId: 'snooze-1',
        type: 'snooze',
        scheduleId: row.id,
        requestCode: row.requestCode,
        snoozedUntil: until,
      },
      NOW,
      10,
    );
    expect(updated).toEqual(
      expect.objectContaining({
        status: 'scheduled',
        scheduledAt: until,
        snoozedUntil: until,
        reason: 'snoozed-from-notification',
      }),
    );
  });

  it('rejects stale request codes', () => {
    expect(() =>
      applyNativeScheduleAction(
        row,
        {
          actionId: 'complete-1',
          type: 'complete',
          scheduleId: row.id,
          requestCode: row.requestCode + 1,
          snoozedUntil: null,
        },
        NOW,
        10,
      ),
    ).toThrow('does not match');
  });

  it('ignores terminal or unknown actions', () => {
    const completed = { ...row, status: 'completed' as const };
    expect(
      applyNativeScheduleAction(
        completed,
        {
          actionId: 'complete-1',
          type: 'complete',
          scheduleId: row.id,
          requestCode: row.requestCode,
          snoozedUntil: null,
        },
        NOW,
        10,
      ),
    ).toBeNull();
    expect(
      applyNativeScheduleAction(
        row,
        {
          actionId: 'weird',
          type: 'weird',
          scheduleId: row.id,
          requestCode: row.requestCode,
          snoozedUntil: null,
        },
        NOW,
        10,
      ),
    ).toBeNull();
  });
});
