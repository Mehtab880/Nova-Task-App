import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Switch, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { AppButton } from '@/design/AppButton';
import { AppText } from '@/design/AppText';
import { useTheme } from '@/design/ThemeProvider';
import type { RootStackParamList } from '@/navigation/types';
import type { NotificationSettings } from '@/notifications/types';
import {
  openExactAlarmSettings,
  openNotificationSettings,
  requestNotificationPermission,
} from '@/notifications/service';

import { useTaskStore } from '../store';
import { useStoreRevision } from '../TaskStoreProvider';
import { useTaskSnapshot } from '../useTaskSnapshot';
import { ErrorState, LoadingState } from './States';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const SNOOZE_OPTIONS = [5, 10, 15, 30];

export function SettingsScreen(): React.JSX.Element {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const store = useTaskStore();
  const revision = useStoreRevision();
  const { status, snapshot, error, reload } = useTaskSnapshot('inbox');

  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [quietStart, setQuietStart] = useState('22:00');
  const [quietEnd, setQuietEnd] = useState('07:00');
  const [newListName, setNewListName] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadSettings = useCallback(async () => {
    const next = await store.loadSettings();
    setSettings(next);
    setQuietStart(next.quietHoursStart);
    setQuietEnd(next.quietHoursEnd);
  }, [store]);

  useEffect(() => {
    let cancelled = false;
    store
      .loadSettings()
      .then(next => {
        if (cancelled) return;
        setSettings(next);
        setQuietStart(next.quietHoursStart);
        setQuietEnd(next.quietHoursEnd);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setActionError(cause instanceof Error ? cause.message : t('common.failure'));
      });
    return () => {
      cancelled = true;
    };
  }, [store, revision, t]);

  const fail = (cause: unknown): void => {
    setActionError(cause instanceof Error ? cause.message : t('common.failure'));
  };

  const run = (work: () => Promise<void>, done?: string): void => {
    setBusy(true);
    setActionError(null);
    setMessage(null);
    void work()
      .then(() => {
        if (done !== undefined) setMessage(done);
      })
      .catch(fail)
      .finally(() => setBusy(false));
  };

  const handleCreateList = (): void => {
    const name = newListName.trim();
    if (name.length === 0) return;
    run(
      () =>
        store.createList(name).then(() => {
          setNewListName('');
        }),
      t('settings.lists.created'),
    );
  };

  const saveQuietHours = (enabled: boolean): void => {
    if (!TIME_PATTERN.test(quietStart) || !TIME_PATTERN.test(quietEnd)) {
      setActionError(t('tasks.validation.timeFormat'));
      return;
    }
    run(
      () =>
        store
          .saveSettings({
            quietHoursEnabled: enabled,
            quietHoursStart: quietStart,
            quietHoursEnd: quietEnd,
          })
          .then(loadSettings),
      t('settings.saved'),
    );
  };

  if (status === 'loading' || settings === null) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.surface, paddingTop: insets.top }}>
        <LoadingState />
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.surface, paddingTop: insets.top }}>
        <ErrorState message={error?.message ?? t('common.failure')} onRetry={() => void reload()} />
      </View>
    );
  }

  const notificationState = snapshot?.notificationState ?? {
    permission: 'notDetermined' as const,
    exactAlarm: 'notApplicable' as const,
    scheduledCount: 0,
    deferredCount: 0,
    errorCount: 0,
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.surface, paddingTop: insets.top }}>
      <View
        style={{
          paddingHorizontal: theme.spacing.lg,
          paddingVertical: theme.spacing.md,
          borderBottomWidth: theme.sizes.borderHairline,
          borderBottomColor: theme.colors.border,
          gap: theme.spacing.xs,
        }}
      >
        <AppText variant="title" accessibilityRole="header">
          {t('settings.title')}
        </AppText>
        <AppText variant="bodySmall" color="textMuted">
          {t('settings.subtitle')}
        </AppText>
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: theme.spacing.lg,
          paddingBottom: insets.bottom + theme.spacing.xxl,
          gap: theme.spacing.xl,
        }}
      >
        {message === null ? null : (
          <AppText accessibilityLiveRegion="polite" variant="bodySmall" color="success">
            {message}
          </AppText>
        )}
        {actionError === null ? null : (
          <AppText
            accessibilityRole="alert"
            accessibilityLiveRegion="assertive"
            variant="bodySmall"
            color="error"
          >
            {actionError}
          </AppText>
        )}

        <Section title={t('settings.permissions.heading')}>
          <Row
            label={t('settings.permissions.notifications')}
            value={t(`settings.permissions.state.${notificationState.permission}`)}
          />
          <Row
            label={t('settings.permissions.exactAlarms')}
            value={t(`settings.permissions.exact.${notificationState.exactAlarm}`)}
          />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            <AppButton
              label={t('settings.actions.requestPermission')}
              onPress={() => {
                run(async () => {
                  await requestNotificationPermission();
                  await store.sync('permission-change');
                });
              }}
              disabled={busy}
            />
            <AppButton
              label={t('settings.actions.openNotificationSettings')}
              variant="secondary"
              onPress={() => {
                run(async () => {
                  await openNotificationSettings();
                });
              }}
              disabled={busy}
            />
            <AppButton
              label={t('settings.actions.openExactAlarmSettings')}
              variant="secondary"
              onPress={() => {
                run(async () => {
                  await openExactAlarmSettings();
                });
              }}
              disabled={busy}
            />
          </View>
        </Section>

        <Section title={t('settings.organise.heading')}>
          <AppButton
            label={t('settings.organise.archived', {
              count: snapshot?.archivedCount ?? 0,
            })}
            variant="secondary"
            onPress={() => navigation.navigate('Archived')}
            disabled={busy}
            testID="open-archived-button"
          />
          <AppText variant="label" color="textMuted">
            {t('settings.lists.heading')}
          </AppText>
          {(snapshot?.lists ?? []).map(list => (
            <Row
              key={list.id}
              label={list.name}
              value={list.isDefault ? t('settings.lists.default') : t('settings.lists.custom')}
            />
          ))}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: theme.spacing.sm }}>
            <View style={{ flex: 1 }}>
              <LabeledInput
                label={t('settings.lists.nameLabel')}
                value={newListName}
                onChangeText={setNewListName}
                placeholder={t('settings.lists.namePlaceholder')}
                maxLength={80}
              />
            </View>
            <AppButton
              label={t('settings.lists.add')}
              onPress={handleCreateList}
              disabled={busy || newListName.trim().length === 0}
              testID="add-list-button"
            />
          </View>
        </Section>

        <Section title={t('settings.quiet.heading')}>
          <AppText variant="bodySmall" color="textMuted">
            {t('settings.quiet.description')}
          </AppText>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
            <Switch
              accessibilityLabel={t('settings.quiet.toggle')}
              value={settings.quietHoursEnabled}
              onValueChange={value => saveQuietHours(value)}
              testID="quiet-hours-toggle"
            />
            <AppText variant="body" style={{ flex: 1 }}>
              {settings.quietHoursEnabled ? t('common.on') : t('common.off')}
            </AppText>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
            <LabeledInput
              label={t('settings.quiet.start')}
              value={quietStart}
              onChangeText={setQuietStart}
            />
            <LabeledInput
              label={t('settings.quiet.end')}
              value={quietEnd}
              onChangeText={setQuietEnd}
            />
          </View>
          <AppButton
            label={t('settings.quiet.save')}
            variant="secondary"
            onPress={() => saveQuietHours(settings.quietHoursEnabled)}
            disabled={busy}
          />
        </Section>

        <Section title={t('settings.defaults.heading')}>
          <Row label={t('settings.defaults.timezone')} value={settings.timezone} />
          <Row label={t('settings.defaults.reminderTime')} value={settings.defaultReminderTime} />
          <AppText variant="label" color="textMuted">
            {t('settings.defaults.snooze')}
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {SNOOZE_OPTIONS.map(minutes => (
              <AppButton
                key={minutes}
                label={t('settings.defaults.minutes', { count: minutes })}
                variant={settings.snoozeMinutes === minutes ? 'primary' : 'secondary'}
                selected={settings.snoozeMinutes === minutes}
                onPress={() => {
                  run(
                    () => store.saveSettings({ snoozeMinutes: minutes }).then(loadSettings),
                    t('settings.saved'),
                  );
                }}
                disabled={busy}
              />
            ))}
          </View>
        </Section>

        <Section title={t('settings.status.heading')}>
          <Row
            label={t('settings.status.scheduled')}
            value={String(notificationState.scheduledCount)}
          />
          <Row
            label={t('settings.status.deferred')}
            value={String(notificationState.deferredCount)}
          />
          <Row label={t('settings.status.errors')} value={String(notificationState.errorCount)} />
          <AppButton
            label={t('settings.actions.syncNow')}
            onPress={() => {
              run(() => store.sync('settings-manual'), t('settings.synced'));
            }}
            disabled={busy}
            testID="sync-now-button"
          />
        </Section>
      </ScrollView>
    </View>
  );
}

function Section({
  title,
  children,
}: {
  readonly title: string;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.sm }}>
      <AppText variant="label" color="textMuted" accessibilityRole="header">
        {title}
      </AppText>
      {children}
    </View>
  );
}

function Row({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}): React.JSX.Element {
  const theme = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${value}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        minHeight: theme.sizes.touchMinimum,
      }}
    >
      <AppText variant="body" style={{ flex: 1 }}>
        {label}
      </AppText>
      <AppText variant="bodySmall" color="textMuted">
        {value}
      </AppText>
    </View>
  );
}

function LabeledInput({
  label,
  value,
  onChangeText,
  placeholder = 'HH:mm',
  maxLength = 5,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChangeText: (value: string) => void;
  readonly placeholder?: string;
  readonly maxLength?: number;
}): React.JSX.Element {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, gap: theme.spacing.xs }}>
      <AppText variant="caption" color="textMuted">
        {label}
      </AppText>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        autoCapitalize="none"
        maxLength={maxLength}
        style={{
          minHeight: 48,
          borderRadius: theme.radius.md,
          borderWidth: theme.sizes.borderHairline,
          borderColor: theme.colors.border,
          paddingHorizontal: theme.spacing.md,
          color: theme.colors.text,
          backgroundColor: theme.colors.surfaceRaised,
        }}
      />
    </View>
  );
}
