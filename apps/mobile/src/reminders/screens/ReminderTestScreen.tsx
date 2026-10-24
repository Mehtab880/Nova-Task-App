import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useState } from 'react';
import { Alert, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/design/AppText';
import { useTheme } from '@/design/ThemeProvider';
import type { RootStackParamList } from '@/navigation/types';

import type { ReminderSnapshot, ReminderStatus } from '../types';
import { ReminderScreenShell } from '../ui/ReminderScreenShell';
import {
  cancelReminderFromApp,
  clearAllReminders,
  completeReminderFromApp,
  createReminder,
  createStressReminders,
  loadReminderSnapshot,
  openExactAlarmSettings,
  openNotificationSettings,
  readReminderSnapshot,
  requestNotificationPermission,
  sendImmediateTestNotification,
  snoozeReminderFromApp,
} from '../service';
import { ActionButton } from '../ui/ActionButton';
import { Card, KeyValueRow, SectionTitle, StatusBadge, type ReminderTone } from '../ui/Primitives';
import {
  deliveryKey,
  formatReminderTrigger,
  reminderStatusKey,
  scheduleStateKey,
  scheduleStateTone,
} from '../ui/labels';

const DELAY_OPTIONS = [
  { seconds: 10, label: 'reminders.test.delay10' as const },
  { seconds: 30, label: 'reminders.test.delay30' as const },
  { seconds: 60, label: 'reminders.test.delay60' as const },
  { seconds: 300, label: 'reminders.test.delay300' as const },
] as const;

const VISIBLE_LIMIT = 30;

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function statusTone(status: ReminderStatus): ReminderTone {
  if (status === 'completed') return 'success';
  if (status === 'cancelled') return 'neutral';
  return 'info';
}

export function ReminderTestScreen(): React.JSX.Element {
  const theme = useTheme();
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [snapshot, setSnapshot] = useState<ReminderSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [delaySeconds, setDelaySeconds] = useState(30);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void loadReminderSnapshot('app_foreground')
        .then(next => {
          if (active) {
            setSnapshot(next);
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
      const result = await operation();
      setSnapshot(await readReminderSnapshot());
      setMessage(result);
    } catch (operationError) {
      setError(errorText(operationError));
    } finally {
      setBusy(false);
    }
  }, []);

  const scheduleReminder = useCallback((): void => {
    void run(async () => {
      await createReminder({
        title: title.trim().length > 0 ? title.trim() : t('reminders.test.title'),
        body,
        triggerAt: Date.now() + delaySeconds * 1_000,
      });
      setTitle('');
      setBody('');
      return t('reminders.test.toastScheduled');
    });
  }, [body, delaySeconds, run, t, title]);

  const sendImmediate = useCallback((): void => {
    void run(async () => {
      const delivery = await sendImmediateTestNotification(
        title.trim().length > 0 ? title.trim() : t('reminders.test.title'),
        body,
      );
      return t('reminders.test.toastImmediate', {
        delivery: t(deliveryKey(delivery)),
      });
    });
  }, [body, run, t, title]);

  const syncNow = useCallback((): void => {
    void run(async () => {
      const next = await loadReminderSnapshot('manual');
      setSnapshot(next);
      const native = next.lastSync;
      return t('reminders.test.toastSynced', {
        scheduled: native?.scheduledCount ?? 0,
        exact: native?.exactCount ?? 0,
        inexact: native?.inexactCount ?? 0,
        deferred: native?.deferredCount ?? 0,
      });
    });
  }, [run, t]);

  const confirmClear = useCallback((): void => {
    Alert.alert(t('reminders.test.confirmClearTitle'), t('reminders.test.confirmClearMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('reminders.test.clear'),
        style: 'destructive',
        onPress: () => {
          void run(async () => {
            await clearAllReminders();
            return t('reminders.test.toastCleared');
          });
        },
      },
    ]);
  }, [run, t]);

  const confirmStress = useCallback((): void => {
    Alert.alert(t('reminders.test.confirmStressTitle'), t('reminders.test.confirmStressMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('reminders.test.stress'),
        onPress: () => {
          void run(async () => {
            const result = await createStressReminders(205);
            return t('reminders.test.seedResult', {
              count: result.created,
              scheduled: result.sync.native.scheduledCount,
              deferred: result.sync.native.deferredCount,
            });
          });
        },
      },
    ]);
  }, [run, t]);

  const notificationLabel =
    snapshot === null
      ? t('common.working')
      : snapshot.notificationState.notificationPermission === 'granted'
        ? t('reminders.test.permission.granted')
        : snapshot.notificationState.notificationPermission === 'denied'
          ? t('reminders.test.permission.denied')
          : t('reminders.test.permission.notDetermined');

  const exactLabel =
    snapshot === null
      ? t('common.working')
      : snapshot.notificationState.exactAlarm === 'granted'
        ? t('reminders.test.exact.granted')
        : snapshot.notificationState.exactAlarm === 'denied'
          ? t('reminders.test.exact.denied')
          : t('reminders.test.exact.notApplicable');

  const channelLabel =
    snapshot === null
      ? t('common.working')
      : snapshot.notificationState.channelBlocked
        ? t('reminders.test.channelState.blocked')
        : snapshot.notificationState.channelExists
          ? t('reminders.test.channelState.ready')
          : t('reminders.test.channelState.missing');

  const reminders = snapshot?.reminders ?? [];
  const visible = reminders.slice(0, VISIBLE_LIMIT);

  return (
    <ReminderScreenShell
      title={t('reminders.test.title')}
      subtitle={t('reminders.test.subtitle')}
      onBack={() => navigation.goBack()}
    >
      <Card>
        <SectionTitle>{t('reminders.test.permissions')}</SectionTitle>
        <KeyValueRow
          label={t('reminders.test.notificationPermission')}
          value={notificationLabel}
          tone={
            snapshot?.notificationState.notificationPermission === 'granted' ? 'success' : 'warning'
          }
        />
        <KeyValueRow
          label={t('reminders.test.exactAlarm')}
          value={exactLabel}
          tone={snapshot?.notificationState.exactAlarm === 'denied' ? 'warning' : 'neutral'}
        />
        <KeyValueRow
          label={t('reminders.test.channel')}
          value={channelLabel}
          tone={snapshot?.notificationState.channelBlocked ? 'error' : 'neutral'}
        />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
          <ActionButton
            label={t('reminders.test.requestPermission')}
            variant="secondary"
            disabled={busy}
            style={{ flexGrow: 1 }}
            onPress={() => {
              void run(async () => {
                await requestNotificationPermission();
                return t('reminders.test.permissionUpdated');
              });
            }}
          />
          <ActionButton
            label={t('reminders.test.openNotificationSettings')}
            variant="secondary"
            disabled={busy}
            style={{ flexGrow: 1 }}
            onPress={() => {
              void run(async () => {
                await openNotificationSettings();
                return t('reminders.test.settingsOpened');
              });
            }}
          />
          <ActionButton
            label={t('reminders.test.openExactAlarmSettings')}
            variant="secondary"
            disabled={busy}
            style={{ flexGrow: 1 }}
            onPress={() => {
              void run(async () => {
                await openExactAlarmSettings();
                return t('reminders.test.settingsOpened');
              });
            }}
          />
        </View>
      </Card>

      <Card>
        <SectionTitle>{t('reminders.test.createSection')}</SectionTitle>

        <AppText variant="label">{t('reminders.test.titleLabel')}</AppText>
        <TextInput
          accessibilityLabel={t('reminders.test.titleLabel')}
          value={title}
          onChangeText={setTitle}
          placeholder={t('reminders.test.titlePlaceholder')}
          placeholderTextColor={theme.colors.textMuted}
          maxLength={120}
          style={[
            theme.typography.body,
            {
              color: theme.colors.text,
              backgroundColor: theme.colors.surfaceSunken,
              borderColor: theme.colors.border,
              borderWidth: theme.sizes.borderHairline,
              borderRadius: theme.radius.md,
              paddingHorizontal: theme.spacing.md,
              paddingVertical: theme.spacing.sm,
              minHeight: theme.sizes.touchMinimum,
            },
          ]}
        />

        <AppText variant="label">{t('reminders.test.bodyLabel')}</AppText>
        <TextInput
          accessibilityLabel={t('reminders.test.bodyLabel')}
          value={body}
          onChangeText={setBody}
          placeholder={t('reminders.test.bodyPlaceholder')}
          placeholderTextColor={theme.colors.textMuted}
          maxLength={500}
          multiline
          style={[
            theme.typography.body,
            {
              color: theme.colors.text,
              backgroundColor: theme.colors.surfaceSunken,
              borderColor: theme.colors.border,
              borderWidth: theme.sizes.borderHairline,
              borderRadius: theme.radius.md,
              paddingHorizontal: theme.spacing.md,
              paddingVertical: theme.spacing.sm,
              minHeight: 80,
              textAlignVertical: 'top',
            },
          ]}
        />

        <AppText variant="label">{t('reminders.test.delayLabel')}</AppText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
          {DELAY_OPTIONS.map(option => (
            <ActionButton
              key={option.seconds}
              label={t(option.label)}
              variant={delaySeconds === option.seconds ? 'primary' : 'secondary'}
              selected={delaySeconds === option.seconds}
              disabled={busy}
              style={{ flexGrow: 1 }}
              onPress={() => setDelaySeconds(option.seconds)}
            />
          ))}
        </View>

        <ActionButton
          label={t('reminders.test.schedule')}
          disabled={busy}
          onPress={scheduleReminder}
        />
        <ActionButton
          label={t('reminders.test.immediate')}
          variant="secondary"
          disabled={busy}
          onPress={sendImmediate}
        />
        <ActionButton
          label={t('reminders.test.sync')}
          variant="secondary"
          disabled={busy}
          onPress={syncNow}
        />
        <ActionButton
          label={t('reminders.test.stress')}
          variant="secondary"
          disabled={busy}
          onPress={confirmStress}
        />
        <ActionButton
          label={t('reminders.test.clear')}
          variant="danger"
          disabled={busy}
          onPress={confirmClear}
        />
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
        <SectionTitle>{t('reminders.test.listSection')}</SectionTitle>
        {reminders.length > VISIBLE_LIMIT ? (
          <AppText variant="caption" color="textMuted">
            {t('reminders.test.showing', {
              shown: VISIBLE_LIMIT,
              total: reminders.length,
            })}
          </AppText>
        ) : null}
        {reminders.length === 0 ? (
          <AppText variant="bodySmall" color="textMuted">
            {t('reminders.test.empty')}
          </AppText>
        ) : (
          visible.map(reminder => (
            <View
              key={reminder.id}
              style={{
                gap: theme.spacing.sm,
                paddingVertical: theme.spacing.md,
                borderTopWidth: theme.sizes.borderHairline,
                borderTopColor: theme.colors.border,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  gap: theme.spacing.sm,
                }}
              >
                <AppText variant="bodyStrong" style={{ flex: 1 }}>
                  {reminder.title}
                </AppText>
                <StatusBadge
                  label={t(reminderStatusKey(reminder.status))}
                  tone={statusTone(reminder.status)}
                />
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
                <StatusBadge
                  label={t(scheduleStateKey(reminder.scheduleState))}
                  tone={scheduleStateTone(reminder.scheduleState)}
                />
              </View>
              <AppText variant="caption" color="textMuted">
                {t('reminders.test.triggersAt', {
                  time: formatReminderTrigger(reminder.triggerAt),
                })}
              </AppText>
              {reminder.body.length === 0 ? null : (
                <AppText variant="bodySmall">{reminder.body}</AppText>
              )}
              {reminder.scheduleReason === null ? null : (
                <AppText variant="caption" color="textMuted">
                  {t('reminders.test.reasonLabel', { reason: reminder.scheduleReason })}
                </AppText>
              )}
              {reminder.status === 'scheduled' ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
                  <ActionButton
                    label={t('reminders.test.complete')}
                    variant="secondary"
                    disabled={busy}
                    style={{ flexGrow: 1 }}
                    onPress={() => {
                      void run(async () => {
                        await completeReminderFromApp(reminder.id);
                        return t('reminders.test.toastCompleted');
                      });
                    }}
                  />
                  <ActionButton
                    label={t('reminders.test.snooze')}
                    variant="secondary"
                    disabled={busy}
                    style={{ flexGrow: 1 }}
                    onPress={() => {
                      void run(async () => {
                        await snoozeReminderFromApp(reminder.id);
                        return t('reminders.test.toastSnoozed');
                      });
                    }}
                  />
                  <ActionButton
                    label={t('reminders.test.cancel')}
                    variant="danger"
                    disabled={busy}
                    style={{ flexGrow: 1 }}
                    onPress={() => {
                      void run(async () => {
                        await cancelReminderFromApp(reminder.id);
                        return t('reminders.test.toastCancelled');
                      });
                    }}
                  />
                </View>
              ) : null}
            </View>
          ))
        )}
      </Card>
    </ReminderScreenShell>
  );
}
