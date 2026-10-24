import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/design/AppText';
import { useTheme } from '@/design/ThemeProvider';
import type { RootStackParamList } from '@/navigation/types';

import {
  getReminderDiagnostics,
  loadReminderDiagnostics,
  rescheduleFromNativeCache,
} from '../service';
import type { ReminderDiagnostics } from '../types';
import { ActionButton } from '../ui/ActionButton';
import { Card, IssueCard, KeyValueRow, SectionTitle, StatusBadge } from '../ui/Primitives';
import { ReminderScreenShell } from '../ui/ReminderScreenShell';
import {
  formatBoolean,
  formatChannelImportance,
  formatOptionalTimestamp,
  formatReminderTrigger,
  issueKey,
  scheduleStateKey,
  scheduleStateTone,
} from '../ui/labels';

const VISIBLE_ALARMS = 25;

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function ReminderDiagnosticsScreen(): React.JSX.Element {
  const theme = useTheme();
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [diagnostics, setDiagnostics] = useState<ReminderDiagnostics | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void loadReminderDiagnostics('app_foreground')
        .then(next => {
          if (active) {
            setDiagnostics(next);
            setError(null);
          }
        })
        .catch((loadError: unknown) => {
          if (active) setError(errorText(loadError));
        });
      return () => {
        active = false;
      };
    }, []),
  );

  const run = useCallback(async (operation: () => Promise<string>): Promise<void> => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      setMessage(await operation());
    } catch (operationError) {
      setError(errorText(operationError));
    } finally {
      setBusy(false);
    }
  }, []);

  const refresh = useCallback((): void => {
    void run(async () => {
      const next = await loadReminderDiagnostics('manual');
      setDiagnostics(next);
      return t('reminders.diagnostics.syncResult', {
        scheduled: next.native.store.exactCount + next.native.store.inexactCount,
        deferred: next.native.store.deferredCount,
        errors: next.native.store.errorCount,
      });
    });
  }, [run, t]);

  const rescheduleCache = useCallback((): void => {
    void run(async () => {
      const result = await rescheduleFromNativeCache();
      setDiagnostics(await getReminderDiagnostics());
      return t('reminders.diagnostics.rescheduleResult', {
        scheduled: result.scheduledCount,
        deferred: result.deferredCount,
        errors: result.errorCount,
      });
    });
  }, [run, t]);

  const native = diagnostics?.native;
  const permissions = native?.permissions;
  const importanceLabels = {
    high: t('reminders.diagnostics.importanceHigh'),
    default: t('reminders.diagnostics.importanceDefault'),
    low: t('reminders.diagnostics.importanceLow'),
    min: t('reminders.diagnostics.importanceMin'),
    none: t('reminders.diagnostics.importanceNone'),
    unknown: t('reminders.diagnostics.importanceUnknown'),
  };

  const notificationLabel =
    permissions === undefined
      ? t('common.working')
      : permissions.notificationPermission === 'granted'
        ? t('reminders.test.permission.granted')
        : permissions.notificationPermission === 'denied'
          ? t('reminders.test.permission.denied')
          : t('reminders.test.permission.notDetermined');

  const exactLabel =
    permissions === undefined
      ? t('common.working')
      : permissions.exactAlarm === 'granted'
        ? t('reminders.test.exact.granted')
        : permissions.exactAlarm === 'denied'
          ? t('reminders.test.exact.denied')
          : t('reminders.test.exact.notApplicable');

  const visibleAlarms = native?.store.entries.slice(0, VISIBLE_ALARMS) ?? [];

  return (
    <ReminderScreenShell
      title={t('reminders.diagnostics.title')}
      subtitle={t('reminders.diagnostics.subtitle')}
      onBack={() => navigation.goBack()}
    >
      <Card>
        <SectionTitle>{t('reminders.diagnostics.health')}</SectionTitle>
        {diagnostics === null ? (
          <AppText variant="bodySmall" color="textMuted">
            {t('common.working')}
          </AppText>
        ) : diagnostics.issues.length === 0 ? (
          <StatusBadge label={t('reminders.diagnostics.healthOk')} tone="success" />
        ) : (
          diagnostics.issues.map(issue => (
            <IssueCard
              key={issue.code}
              severity={issue.severity}
              message={t(issueKey(issue.code))}
            />
          ))
        )}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
          <ActionButton
            label={t('common.refresh')}
            variant="secondary"
            disabled={busy}
            style={{ flexGrow: 1 }}
            onPress={refresh}
          />
          <ActionButton
            label={t('reminders.diagnostics.resync')}
            disabled={busy}
            style={{ flexGrow: 1 }}
            onPress={refresh}
          />
          <ActionButton
            label={t('reminders.diagnostics.cacheReschedule')}
            variant="secondary"
            disabled={busy}
            style={{ flexGrow: 1 }}
            onPress={rescheduleCache}
          />
        </View>
      </Card>

      {message === null ? null : (
        <Card>
          <StatusBadge label={t('reminders.test.done')} tone="success" />
          <AppText variant="bodySmall">{message}</AppText>
        </Card>
      )}

      {error === null ? null : (
        <Card style={{ borderColor: theme.colors.error }}>
          <StatusBadge label={t('reminders.severity.error')} tone="error" />
          <AppText variant="bodySmall" color="error">
            {error}
          </AppText>
        </Card>
      )}

      <Card>
        <SectionTitle>{t('reminders.diagnostics.permissions')}</SectionTitle>
        <KeyValueRow
          label={t('reminders.diagnostics.notificationPermission')}
          value={notificationLabel}
          tone={permissions?.notificationPermission === 'granted' ? 'success' : 'warning'}
        />
        <KeyValueRow
          label={t('reminders.diagnostics.appNotifications')}
          value={formatBoolean(
            permissions?.appNotificationsEnabled ?? false,
            t('common.yes'),
            t('common.no'),
          )}
          tone={permissions?.appNotificationsEnabled ? 'success' : 'error'}
        />
        <KeyValueRow
          label={t('reminders.diagnostics.channel')}
          value={
            !(permissions?.channelExists ?? false)
              ? t('reminders.test.channelState.missing')
              : permissions?.channelBlocked
                ? t('reminders.test.channelState.blocked')
                : t('reminders.test.channelState.ready')
          }
          tone={permissions?.channelBlocked ? 'error' : 'neutral'}
        />
        <KeyValueRow
          label={t('reminders.diagnostics.channelImportance')}
          value={formatChannelImportance(permissions?.channelImportance ?? -1, importanceLabels)}
        />
        <KeyValueRow
          label={t('reminders.diagnostics.exactAlarms')}
          value={exactLabel}
          tone={permissions?.exactAlarm === 'denied' ? 'warning' : 'neutral'}
        />
        <KeyValueRow
          label={t('reminders.diagnostics.exactSupported')}
          value={formatBoolean(
            permissions?.exactAlarmSupported ?? false,
            t('common.yes'),
            t('common.no'),
          )}
        />
        <KeyValueRow
          label={t('reminders.diagnostics.batteryOptimization')}
          value={formatBoolean(
            permissions?.batteryOptimizationIgnored ?? false,
            t('common.yes'),
            t('common.no'),
          )}
        />
        <KeyValueRow
          label={t('reminders.diagnostics.powerSave')}
          value={formatBoolean(
            permissions?.powerSaveMode ?? false,
            t('common.on'),
            t('common.off'),
          )}
        />
        <KeyValueRow
          label={t('reminders.diagnostics.deviceIdle')}
          value={formatBoolean(
            permissions?.deviceIdleMode ?? false,
            t('common.on'),
            t('common.off'),
          )}
        />
        <KeyValueRow
          label={t('reminders.diagnostics.sdk')}
          value={String(permissions?.sdkInt ?? 0)}
        />
      </Card>

      <Card>
        <SectionTitle>{t('reminders.diagnostics.store')}</SectionTitle>
        <KeyValueRow
          label={t('reminders.diagnostics.storeCount')}
          value={String(native?.store.count ?? 0)}
        />
        <KeyValueRow
          label={t('reminders.diagnostics.exactCount')}
          value={String(native?.store.exactCount ?? 0)}
        />
        <KeyValueRow
          label={t('reminders.diagnostics.inexactCount')}
          value={String(native?.store.inexactCount ?? 0)}
        />
        <KeyValueRow
          label={t('reminders.diagnostics.deferredCount')}
          value={String(native?.store.deferredCount ?? 0)}
          tone={(native?.store.deferredCount ?? 0) > 0 ? 'warning' : 'neutral'}
        />
        <KeyValueRow
          label={t('reminders.diagnostics.errorCount')}
          value={String(native?.store.errorCount ?? 0)}
          tone={(native?.store.errorCount ?? 0) > 0 ? 'error' : 'neutral'}
        />
        <KeyValueRow
          label={t('reminders.diagnostics.deliveredCount')}
          value={String(native?.store.deliveredCount ?? 0)}
        />
        <KeyValueRow
          label={t('reminders.diagnostics.blockedCount')}
          value={String(native?.store.blockedCount ?? 0)}
          tone={(native?.store.blockedCount ?? 0) > 0 ? 'error' : 'neutral'}
        />
        <KeyValueRow
          label={t('reminders.diagnostics.cap')}
          value={String(native?.store.cap ?? 0)}
        />
        <KeyValueRow
          label={t('reminders.diagnostics.lastReconciled')}
          value={
            formatOptionalTimestamp(native?.store.lastReconciledAt ?? null) ?? t('common.never')
          }
        />
        <KeyValueRow
          label={t('reminders.diagnostics.lastReconcileReason')}
          value={native?.store.lastReconcileReason ?? t('common.notAvailable')}
        />
        <KeyValueRow
          label={t('reminders.diagnostics.lastReschedule')}
          value={
            formatOptionalTimestamp(native?.store.lastRescheduleAt ?? null) ?? t('common.never')
          }
        />
        <KeyValueRow
          label={t('reminders.diagnostics.lastRescheduleReason')}
          value={native?.store.lastRescheduleReason ?? t('common.notAvailable')}
        />
      </Card>

      <Card>
        <SectionTitle>{t('reminders.diagnostics.database')}</SectionTitle>
        <KeyValueRow
          label={t('reminders.diagnostics.dbActive')}
          value={String(diagnostics?.activeCount ?? 0)}
        />
        <KeyValueRow
          label={t('reminders.diagnostics.dbTotal')}
          value={String(diagnostics?.reminders.length ?? 0)}
        />
        <KeyValueRow
          label={t('reminders.diagnostics.missingFromCache')}
          value={String(diagnostics?.missingFromCache.length ?? 0)}
          tone={(diagnostics?.missingFromCache.length ?? 0) > 0 ? 'error' : 'success'}
        />
        <KeyValueRow
          label={t('reminders.diagnostics.extraInCache')}
          value={String(diagnostics?.extraInCache.length ?? 0)}
          tone={(diagnostics?.extraInCache.length ?? 0) > 0 ? 'warning' : 'success'}
        />
        {diagnostics !== null && diagnostics.missingFromCache.length > 0 ? (
          <AppText variant="caption" color="textMuted">
            {diagnostics.missingFromCache.join(', ')}
          </AppText>
        ) : null}
        {diagnostics !== null && diagnostics.extraInCache.length > 0 ? (
          <AppText variant="caption" color="textMuted">
            {diagnostics.extraInCache.join(', ')}
          </AppText>
        ) : null}
      </Card>

      <Card>
        <SectionTitle>{t('reminders.diagnostics.queue')}</SectionTitle>
        <KeyValueRow
          label={t('reminders.diagnostics.pendingActions')}
          value={String(native?.queue.pendingCount ?? 0)}
          tone={(native?.queue.pendingCount ?? 0) > 0 ? 'warning' : 'success'}
        />
        {native !== undefined && native.queue.actions.length > 0 ? (
          native.queue.actions.map(action => (
            <AppText key={action.actionId} variant="caption" color="textMuted">
              {`${action.type} · ${action.reminderId}`}
            </AppText>
          ))
        ) : (
          <AppText variant="bodySmall" color="textMuted">
            {t('reminders.diagnostics.noPendingActions')}
          </AppText>
        )}
      </Card>

      <Card>
        <SectionTitle>{t('reminders.diagnostics.alarms')}</SectionTitle>
        {native === undefined || native.store.entries.length === 0 ? (
          <AppText variant="bodySmall" color="textMuted">
            {t('reminders.diagnostics.noAlarms')}
          </AppText>
        ) : (
          <>
            {native.store.entries.length > VISIBLE_ALARMS ? (
              <AppText variant="caption" color="textMuted">
                {t('reminders.diagnostics.showing', {
                  shown: VISIBLE_ALARMS,
                  total: native.store.entries.length,
                })}
              </AppText>
            ) : null}
            {visibleAlarms.map(alarm => (
              <View
                key={alarm.id}
                style={{
                  gap: theme.spacing.xs,
                  paddingVertical: theme.spacing.md,
                  borderTopWidth: theme.sizes.borderHairline,
                  borderTopColor: theme.colors.border,
                }}
              >
                <AppText variant="bodyStrong">{alarm.title}</AppText>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
                  <StatusBadge
                    label={t(scheduleStateKey(alarm.scheduleMode))}
                    tone={scheduleStateTone(alarm.scheduleMode)}
                  />
                  <StatusBadge
                    label={t(
                      alarm.pendingIntentExists
                        ? 'reminders.diagnostics.alarmRegistered'
                        : 'reminders.diagnostics.alarmMissing',
                    )}
                    tone={alarm.pendingIntentExists ? 'success' : 'warning'}
                  />
                </View>
                <AppText variant="caption" color="textMuted">
                  {t('reminders.test.triggersAt', {
                    time: formatReminderTrigger(alarm.triggerAt),
                  })}
                </AppText>
                <AppText variant="caption" color="textMuted">
                  {`#${String(alarm.requestCode)} · ${alarm.id}`}
                </AppText>
                {alarm.lastFiredAt === null ? null : (
                  <AppText variant="caption" color="textMuted">
                    {`${t('reminders.diagnostics.lastFired')}: ${formatReminderTrigger(
                      alarm.lastFiredAt,
                    )}`}
                  </AppText>
                )}
                {alarm.scheduleReason === null ? null : (
                  <AppText variant="caption" color="textMuted">
                    {t('reminders.test.reasonLabel', { reason: alarm.scheduleReason })}
                  </AppText>
                )}
              </View>
            ))}
          </>
        )}
      </Card>
    </ReminderScreenShell>
  );
}
