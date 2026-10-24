import { createNovaRemindersBridgeFrom, type NovaRemindersNativeModule } from './bridge';
import type {
  NativeNotificationState,
  NativeReconcileResult,
  NativeReminderDiagnostics,
} from './types';

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

const reconcileResult: NativeReconcileResult = {
  reconciledAt: 1,
  cap: 200,
  scheduledCount: 0,
  exactCount: 0,
  inexactCount: 0,
  deferredCount: 0,
  errorCount: 0,
  results: [],
};

const diagnostics: NativeReminderDiagnostics = {
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
    lastReconciledAt: null,
    lastReconcileReason: null,
    lastRescheduleAt: null,
    lastRescheduleReason: null,
    entries: [],
  },
  queue: { pendingCount: 0, actions: [] },
};

function mockNative(): NovaRemindersNativeModule {
  return {
    getNotificationState: jest.fn(() => Promise.resolve(notificationState)),
    requestNotificationPermission: jest.fn(() => Promise.resolve('granted' as const)),
    openNotificationSettings: jest.fn(() => Promise.resolve(true)),
    openExactAlarmSettings: jest.fn(() => Promise.resolve(true)),
    reconcile: jest.fn(() => Promise.resolve(reconcileResult)),
    rescheduleFromStore: jest.fn(() => Promise.resolve(reconcileResult)),
    notifyNow: jest.fn(() => Promise.resolve('posted' as const)),
    drainActions: jest.fn(() => Promise.resolve([])),
    acknowledgeActions: jest.fn(() => Promise.resolve(0)),
    getDiagnostics: jest.fn(() => Promise.resolve(diagnostics)),
  };
}

describe('NovaReminders bridge', () => {
  it('fails with a stable error when the native module is absent', () => {
    expect(() => createNovaRemindersBridgeFrom(undefined)).toThrow(
      'NovaReminders native module is unavailable',
    );
    try {
      createNovaRemindersBridgeFrom(undefined);
    } catch (error) {
      expect(error).toMatchObject({ code: 'reminders_unavailable' });
    }
  });

  it('delegates every bridge operation', async () => {
    const native = mockNative();
    const bridge = createNovaRemindersBridgeFrom(native);

    await expect(bridge.getNotificationState()).resolves.toBe(notificationState);
    await expect(bridge.requestNotificationPermission()).resolves.toBe('granted');
    await expect(bridge.openNotificationSettings()).resolves.toBe(true);
    await expect(bridge.openExactAlarmSettings()).resolves.toBe(true);
    await expect(bridge.reconcile([], 'test')).resolves.toBe(reconcileResult);
    await expect(bridge.rescheduleFromStore('test')).resolves.toBe(reconcileResult);
    await expect(
      bridge.notifyNow({
        id: 'r1',
        requestCode: 1,
        title: 't',
        body: '',
        triggerAt: 1,
        status: 'scheduled',
      }),
    ).resolves.toBe('posted');
    await expect(bridge.drainActions()).resolves.toEqual([]);
    await expect(bridge.acknowledgeActions(['a'])).resolves.toBe(0);
    await expect(bridge.getDiagnostics()).resolves.toBe(diagnostics);
  });
});
