import { applyNativeAction, rowToReminder, toNativeInput } from './mappers';
import type { NativeReminderAction, Reminder } from './types';

const baseReminder: Reminder = {
  id: 'reminder_01',
  taskId: 'task_01',
  title: 'Review plan',
  body: 'Before standup',
  triggerAt: 10_000,
  status: 'scheduled',
  requestCode: 42,
  scheduleState: 'exact',
  scheduleReason: null,
  snoozeUntil: null,
  createdAt: 1,
  updatedAt: 2,
  completedAt: null,
};

const actionBase: NativeReminderAction = {
  actionId: 'complete-reminder_01',
  type: 'complete',
  reminderId: 'reminder_01',
  requestCode: 42,
  occurredAt: 20_000,
  snoozedUntil: null,
  title: 'Review plan',
  body: 'Before standup',
};

describe('reminder mappers', () => {
  it('maps a SQLite row to the canonical record', () => {
    expect(
      rowToReminder({
        id: 'reminder_01',
        task_id: 'task_01',
        title: 'Review plan',
        body: 'Before standup',
        trigger_at: 10_000,
        status: 'scheduled',
        request_code: 42,
        schedule_state: 'exact',
        schedule_reason: null,
        snooze_until: null,
        created_at: 1,
        updated_at: 2,
        completed_at: null,
      }),
    ).toEqual(baseReminder);
  });

  it('maps the canonical record to the native input', () => {
    expect(toNativeInput(baseReminder)).toEqual({
      id: 'reminder_01',
      requestCode: 42,
      title: 'Review plan',
      body: 'Before standup',
      triggerAt: 10_000,
      status: 'scheduled',
    });
  });

  it('applies a complete action idempotently', () => {
    const completed = applyNativeAction(baseReminder, actionBase, 20_000);
    expect(completed).toEqual({
      ...baseReminder,
      status: 'completed',
      scheduleState: 'completed',
      scheduleReason: 'completed-from-notification',
      completedAt: 20_000,
      updatedAt: 20_000,
    });
    expect(applyNativeAction(completed ?? baseReminder, actionBase, 21_000)).toBeNull();
  });

  it('applies a snooze action and keeps SQLite status active', () => {
    const snoozed = applyNativeAction(
      baseReminder,
      {
        ...actionBase,
        actionId: 'snooze-reminder_01-610000',
        type: 'snooze',
        snoozedUntil: 610_000,
      },
      10_000,
    );
    expect(snoozed).toEqual({
      ...baseReminder,
      triggerAt: 610_000,
      scheduleState: 'pending',
      scheduleReason: 'snoozed-from-notification',
      snoozeUntil: 610_000,
      updatedAt: 10_000,
    });
  });

  it('does not resurrect terminal reminders', () => {
    const cancelled: Reminder = { ...baseReminder, status: 'cancelled' };
    expect(
      applyNativeAction(
        cancelled,
        {
          ...actionBase,
          actionId: 'snooze-reminder_01-610000',
          type: 'snooze',
          snoozedUntil: 610_000,
        },
        10_000,
      ),
    ).toBeNull();
  });

  it('rejects an action for another reminder', () => {
    expect(() =>
      applyNativeAction(baseReminder, { ...actionBase, reminderId: 'other' }, 10_000),
    ).toThrow('Native action does not match the reminder being updated');
  });

  it('rejects an action with a stale request code', () => {
    expect(() =>
      applyNativeAction(baseReminder, { ...actionBase, requestCode: 99 }, 10_000),
    ).toThrow('Native action does not match the reminder being updated');
  });
});
