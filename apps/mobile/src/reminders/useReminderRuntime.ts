import { useEffect } from 'react';
import { AppState } from 'react-native';

import { environment } from '@/core/env/environment';
import { logger } from '@/core/logging';

import { syncReminders } from './service';

/**
 * Dev-only M4 runtime. Reconciles SQLite into AlarmManager at launch and every
 * foreground transition, which also drains notification actions.
 */
export function useReminderRuntime(): void {
  useEffect(() => {
    if (!environment.m4Enabled) return;
    // Jest has no native module or SQLite; pure unit tests cover reminder policy.
    if (process.env.NODE_ENV === 'test') return;

    let active = true;
    const run = (reason: 'app_start' | 'app_foreground'): void => {
      void syncReminders(reason)
        .then(result => {
          if (!active) return;
          logger.debug('Reminder runtime synchronized', {
            reason,
            scheduled: result.native.scheduledCount,
            deferred: result.native.deferredCount,
          });
        })
        .catch((error: unknown) => {
          logger.error('Reminder runtime synchronization failed', {
            reason,
            error: error instanceof Error ? error.message : String(error),
          });
        });
    };

    run('app_start');
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        run('app_foreground');
      }
    });

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
}
