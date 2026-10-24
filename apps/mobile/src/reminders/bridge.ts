import { NativeModules } from 'react-native';

import { AppError } from '@/core/errors/AppError';

import type {
  NativeDelivery,
  NativeNotificationState,
  NativeReconcileResult,
  NativeReminderAction,
  NativeReminderDiagnostics,
  NativeReminderInput,
  NotificationPermission,
} from './types';

export interface NovaRemindersNativeModule {
  getNotificationState(): Promise<NativeNotificationState>;
  requestNotificationPermission(): Promise<NotificationPermission>;
  openNotificationSettings(): Promise<boolean>;
  openExactAlarmSettings(): Promise<boolean>;
  reconcile(
    reminders: readonly NativeReminderInput[],
    reason: string,
  ): Promise<NativeReconcileResult>;
  rescheduleFromStore(reason: string): Promise<NativeReconcileResult>;
  notifyNow(reminder: NativeReminderInput): Promise<NativeDelivery>;
  drainActions(): Promise<readonly NativeReminderAction[]>;
  acknowledgeActions(actionIds: readonly string[]): Promise<number>;
  getDiagnostics(): Promise<NativeReminderDiagnostics>;
}

export interface NovaRemindersBridge {
  readonly native: NovaRemindersNativeModule;
  getNotificationState(): Promise<NativeNotificationState>;
  requestNotificationPermission(): Promise<NotificationPermission>;
  openNotificationSettings(): Promise<boolean>;
  openExactAlarmSettings(): Promise<boolean>;
  reconcile(
    reminders: readonly NativeReminderInput[],
    reason: string,
  ): Promise<NativeReconcileResult>;
  rescheduleFromStore(reason: string): Promise<NativeReconcileResult>;
  notifyNow(reminder: NativeReminderInput): Promise<NativeDelivery>;
  drainActions(): Promise<readonly NativeReminderAction[]>;
  acknowledgeActions(actionIds: readonly string[]): Promise<number>;
  getDiagnostics(): Promise<NativeReminderDiagnostics>;
}

function missingModuleError(): AppError {
  return new AppError({
    code: 'reminders_unavailable',
    category: 'configuration',
    message: 'NovaReminders native module is unavailable. Rebuild the Android app after adding M4.',
  });
}

export function isNovaRemindersAvailable(): boolean {
  return NativeModules['NovaReminders'] !== undefined;
}

/**
 * Typed JS facade over the app-local legacy native module. Keeping the bridge
 * narrow makes the native contract explicit and the dev screens testable.
 */
export function createNovaRemindersBridge(): NovaRemindersBridge {
  return createNovaRemindersBridgeFrom(
    NativeModules['NovaReminders'] as NovaRemindersNativeModule | undefined,
  );
}

export function createNovaRemindersBridgeFrom(
  native: NovaRemindersNativeModule | undefined,
): NovaRemindersBridge {
  if (native === undefined) {
    throw missingModuleError();
  }

  return {
    native,
    getNotificationState: () => native.getNotificationState(),
    requestNotificationPermission: () => native.requestNotificationPermission(),
    openNotificationSettings: () => native.openNotificationSettings(),
    openExactAlarmSettings: () => native.openExactAlarmSettings(),
    reconcile: (reminders, reason) => native.reconcile(reminders, reason),
    rescheduleFromStore: reason => native.rescheduleFromStore(reason),
    notifyNow: reminder => native.notifyNow(reminder),
    drainActions: () => native.drainActions(),
    acknowledgeActions: actionIds => native.acknowledgeActions(actionIds),
    getDiagnostics: () => native.getDiagnostics(),
  };
}
