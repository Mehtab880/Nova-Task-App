import {
  allocateRequestCode,
  computeSnoozeUntil,
  deriveReminderIssues,
  selectSchedulable,
  validateReminderDraft,
} from './policy';
import type { NativeNotificationState, NativeReminderDiagnostics, Reminder } from './types';

const notificationState: NativeNotificationState = {
  notificationPermission: 'granted',
  appNotificationsEnabled: true,
  channelExists: true,
  channelImportance: 4,
  channelBlocked: false,
  exactAlarm: 'granted',
  exactAlarmSupported: true,
  batteryOptimizationIgnored: true,
  powerSaveMode: false,
  deviceIdleMode: false,
  sdkInt: 36,
};

function diagnostics(
  overrides: Partial<NativeReminderDiagnostics['store']> = {},
): NativeReminderDiagnostics {
  return {
    generatedAt: 1,
    version: 'test',
    permissions: notificationState,
    store: {
      count: 0,
      exactCount: 0,
      inexactCount: 0,
      deferredCount: 0,
      errorCount: 0,
      deliveredCount: 0,
      blockedCount: 0,
      cap: 200,
      lastReconciledAt: 1,
      lastReconcileReason: 'test',
      lastRescheduleAt: null,
      lastRescheduleReason: null,
      entries: [],
      ...overrides,
    },
    queue: { pendingCount: 0, actions: [] },
  };
}

function reminder(id: string): Reminder {
  return {
    id,
    taskId: null,
    title: id,
    body: '',
    triggerAt: 1_000,
    status: 'scheduled',
    requestCode: 1,
    scheduleState: 'exact',
    scheduleReason: null,
    snoozeUntil: null,
    createdAt: 1,
    updatedAt: 1,
    completedAt: null,
  };
}

describe('reminder policy', () => {
  it('keeps the earliest 200 reminders and preserves overflow', () => {
    const reminders = Array.from({ length: 205 }, (_, index) => ({
      id: `r${String(index + 1).padStart(3, '0')}`,
      triggerAt: 10_000 + index,
    }));
    const { kept, overflow } = selectSchedulable([...reminders].reverse());
    expect(kept).toHaveLength(200);
    expect(overflow).toHaveLength(5);
    expect(kept[0]?.id).toBe('r001');
    expect(overflow[0]?.id).toBe('r201');
  });

  it('allocates the lowest free positive request code', () => {
    expect(allocateRequestCode([])).toBe(1);
    expect(allocateRequestCode([1, 2, 4])).toBe(3);
    expect(allocateRequestCode([700_000_000, 1])).toBe(2);
  });

  it('normalizes and validates reminder drafts', () => {
    expect(
      validateReminderDraft({
        title: '  Review plan  ',
        body: '  detail  ',
        triggerAt: 1_234.9,
      }),
    ).toEqual({ title: 'Review plan', body: 'detail', triggerAt: 1_234 });
    expect(() => validateReminderDraft({ title: '   ', triggerAt: 1 })).toThrow(
      'A reminder title is required',
    );
    expect(() => validateReminderDraft({ title: 'x'.repeat(121), triggerAt: 1 })).toThrow(
      'Reminder titles cannot exceed 120 characters',
    );
  });

  it('computes a ten-minute snooze', () => {
    expect(computeSnoozeUntil(1_000)).toBe(601_000);
    expect(computeSnoozeUntil(1_000, 5)).toBe(301_000);
  });

  it('reports permission, cap, drift, and power issues deterministically', () => {
    const issues = deriveReminderIssues({
      notificationState: {
        ...notificationState,
        notificationPermission: 'denied',
        exactAlarm: 'denied',
        powerSaveMode: true,
        batteryOptimizationIgnored: false,
      },
      native: diagnostics({ deferredCount: 5, errorCount: 1, blockedCount: 2 }),
      activeReminderIds: ['missing-from-cache'],
      pendingActionCount: 2,
    });
    expect(issues.map(issue => issue.code)).toEqual([
      'notificationsDenied',
      'exactAlarmDenied',
      'pendingAlarmCap',
      'alarmScheduleErrors',
      'deliveryBlocked',
      'pendingNativeActions',
      'cacheDrift',
      'batterySaverActive',
      'batteryOptimizationAllowed',
    ]);
  });

  it('reports a clean empty state without blocking errors', () => {
    const issues = deriveReminderIssues({
      notificationState,
      native: diagnostics(),
      activeReminderIds: [],
      pendingActionCount: 0,
    });
    expect(issues).toEqual([{ code: 'noScheduledReminders', severity: 'info' }]);
  });

  it('reports cache drift for extra native entries', () => {
    const issues = deriveReminderIssues({
      notificationState,
      native: diagnostics({
        entries: [
          {
            id: 'extra',
            requestCode: 1,
            title: 'extra',
            triggerAt: 1,
            status: 'scheduled',
            scheduleMode: 'exact',
            scheduleReason: null,
            scheduledAt: 1,
            lastFiredAt: null,
            deliveryState: null,
            triggerSeq: 1,
            deliveredSeq: 0,
            dismissedSeq: 0,
            dismissedAt: null,
            pendingIntentExists: true,
          },
        ],
      }),
      activeReminderIds: [reminder('a').id],
      pendingActionCount: 0,
    });
    expect(issues.some(issue => issue.code === 'cacheDrift')).toBe(true);
  });
});
