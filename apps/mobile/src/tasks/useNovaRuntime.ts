import { useEffect } from 'react';
import { AppState } from 'react-native';

import { logger } from '@/core/logging';
import { systemClock } from '@/core/time/Clock';
import { deviceTimeZone } from '@/db/m5';
import { drainNativeActions, reconcileNotifications } from '@/notifications/service';

import {
  currentContext,
  loadNotificationSettings,
  recomputeFloatingTimes,
  saveNotificationSettings,
} from './service';
import { useTaskStore } from './store';

/**
 * M5 runtime. SQLite is the source of truth, so every trigger rebuilds the
 * native schedule projection:
 *
 * - app start and every foreground transition
 * - device time-zone changes (floating wall times are recomputed)
 * - task, reminder, recurrence, and settings mutations (via the store)
 *
 * Boot, time change, and time-zone broadcasts are handled natively and only
 * reschedule from the native cache; the next foreground reconciles SQLite.
 */
export function useNovaRuntime(): void {
  const store = useTaskStore();

  useEffect(() => {
    // Jest has no native module or SQLite; pure tests cover projection instead.
    if (process.env.NODE_ENV === 'test') return;

    let active = true;
    let lastZone = deviceTimeZone();

    const run = async (reason: string): Promise<void> => {
      try {
        const zone = deviceTimeZone();
        if (zone !== lastZone) {
          lastZone = zone;
          const now = systemClock.now().getTime();
          await recomputeFloatingTimes({ now, timeZone: zone });
          await saveNotificationSettings({ timezone: zone }, currentContext(zone));
          reason = 'time-zone-change';
        }
        await drainNativeActions();
        await store.sync(reason);
        const settings = await loadNotificationSettings();
        if (active) {
          logger.debug('Nova runtime reconciled', {
            reason,
            timeZone: settings.timezone,
          });
        }
      } catch (error: unknown) {
        logger.error('Nova runtime reconciliation failed', {
          reason,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    };

    void run('app-start');

    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        void run('app-foreground');
      }
    });

    return () => {
      active = false;
      subscription.remove();
    };
  }, [store]);
}

export async function reconcileAfterPermissionChange(): Promise<void> {
  await reconcileNotifications('permission-change');
}
