import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { AppButton } from '@/design/AppButton';
import { AppText } from '@/design/AppText';
import { useTheme } from '@/design/ThemeProvider';
import type { RootStackParamList } from '@/navigation/types';
import { deviceTimeZone } from '@/db/m5';
import { addDays, isoWeekday, localDateInZone, parseCivilDate } from '@/recurrence/time';
import type { MonthlyMode, RecurrenceFrequency } from '@/recurrence/types';
import { TASK_PRIORITIES, type TaskPriority } from '@/tasks/types';
import type { ReminderInput, RecurrenceInput } from '@/tasks/service';
import { useTaskStore } from '@/tasks/store';
import { useTaskDetail } from '@/tasks/useTaskDetail';
import { useTaskSnapshot } from '@/tasks/useTaskSnapshot';
import { Sheet } from '@/tasks/ui/Sheet';
import { ErrorState, LoadingState } from '@/tasks/ui/States';
import { formatLocalDateLabel, formatLocalTimeLabel } from '@/recurrence/time';

import { weekdayLabel } from './format';

const MAX_TITLE = 500;
const MAX_NOTES = 10_000;

/**
 * Only used before the snapshot arrives, because the screen renders its
 * loading state until `snapshot.today` (or the detail's `today`) is available.
 * Computing it at module load keeps render pure.
 */
const INITIAL_TODAY = localDateInZone(Date.now(), deviceTimeZone());

interface RecurrenceDraft {
  frequency: RecurrenceFrequency;
  interval: number;
  weekdays: number[];
  monthlyMode: MonthlyMode;
  monthDay: number;
  nth: number;
  weekday: number;
  endMode: 'never' | 'date' | 'count';
  endDate: string;
  endAfterCount: number;
  repeatAfterCompletion: boolean;
}

type PickerKind = 'date' | 'time' | 'repeat' | 'reminder' | 'reminderDate' | 'reminderTime' | null;

const styles = StyleSheet.create({
  input: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
});

function defaultRecurrence(dueDate: string, dueTime: string | null): RecurrenceDraft {
  const civil = parseCivilDate(dueDate);
  return {
    frequency: 'daily',
    interval: 1,
    weekdays: [isoWeekday(dueDate)],
    monthlyMode: 'day_of_month',
    monthDay: civil?.day ?? 1,
    nth: 1,
    weekday: isoWeekday(dueDate),
    endMode: 'never',
    endDate: addDays(dueDate, 30),
    endAfterCount: 10,
    repeatAfterCompletion: false,
    ...(dueTime === null ? {} : {}),
  };
}

function buildRecurrenceInput(
  draft: RecurrenceDraft,
  startDate: string,
  startTime: string | null,
): RecurrenceInput {
  return {
    frequency: draft.frequency,
    interval: draft.interval,
    weekdays: draft.frequency === 'weekly' ? draft.weekdays : [],
    monthlyMode: draft.monthlyMode,
    monthDay: draft.monthlyMode === 'day_of_month' ? draft.monthDay : null,
    nth: draft.monthlyMode === 'nth_weekday' ? draft.nth : null,
    weekday: draft.monthlyMode === 'nth_weekday' ? draft.weekday : null,
    startDate,
    startTime,
    endDate: draft.endMode === 'date' ? draft.endDate : null,
    endAfterCount: draft.endMode === 'count' ? draft.endAfterCount : null,
    repeatAfterCompletion: draft.repeatAfterCompletion,
  };
}

export function TaskEditorScreen(): React.JSX.Element {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'TaskEditor'>>();
  const taskId = route.params?.taskId ?? null;
  const store = useTaskStore();
  const snapshotState = useTaskSnapshot('inbox');
  const detailState = useTaskDetail(taskId);
  const snapshot = snapshotState.snapshot;
  const error = taskId === null ? snapshotState.error : detailState.error;
  const status: 'loading' | 'ready' | 'error' =
    taskId === null
      ? snapshotState.status
      : detailState.status === 'error' || detailState.status === 'missing'
        ? 'error'
        : detailState.status === 'ready'
          ? 'ready'
          : 'loading';

  const existing = detailState.detail?.task ?? null;
  const reload = taskId === null ? snapshotState.reload : detailState.reload;
  const today = detailState.detail?.today ?? snapshot?.today ?? INITIAL_TODAY;

  const [hydrated, setHydrated] = useState(false);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('none');
  const [listId, setListId] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [dueTime, setDueTime] = useState<string | null>(null);
  const [reminderMode, setReminderMode] = useState<'none' | 'at_due' | 'before' | 'custom'>('none');
  const [reminderMinutes, setReminderMinutes] = useState(10);
  const [reminderDate, setReminderDate] = useState<string | null>(null);
  const [reminderTime, setReminderTime] = useState<string | null>(null);
  const [repeatEnabled, setRepeatEnabled] = useState(false);
  const [recurrence, setRecurrence] = useState<RecurrenceDraft>(() =>
    defaultRecurrence(today, null),
  );
  const [scope, setScope] = useState<'one' | 'series' | 'following'>('one');
  const [picker, setPicker] = useState<PickerKind>(null);
  const [customDate, setCustomDate] = useState('');
  const [customTime, setCustomTime] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (hydrated || status !== 'ready' || snapshot === null) return;

    // Mirror the loaded snapshot into form state after the commit phase. The
    // editor is a controlled form, so hydration is a one-time external sync.
    const hydrate = async (): Promise<void> => {
      await Promise.resolve();
      if (taskId === null) {
        setListId(snapshot.lists.find(list => list.isDefault)?.id ?? snapshot.lists[0]?.id ?? null);
        setHydrated(true);
        return;
      }
      if (existing === null) return;
      const ownerId = existing.seriesId ?? existing.id;
      const reminder = snapshot.reminders.find(
        entry => entry.taskId === ownerId && entry.status === 'scheduled',
      );
      setTitle(existing.title);
      setNotes(existing.notes);
      setPriority(existing.priority);
      setListId(existing.listId);
      setDueDate(existing.dueDate);
      setDueTime(existing.dueTime);
      if (reminder !== undefined) {
        if (reminder.kind === 'absolute') {
          setReminderMode('custom');
          setReminderDate(reminder.localDate);
          setReminderTime(reminder.localTime);
        } else if (reminder.offsetMinutes === 0) {
          setReminderMode('at_due');
        } else {
          setReminderMode('before');
          setReminderMinutes(Math.abs(reminder.offsetMinutes));
        }
      }
      const recurrenceSummary = snapshot.recurrence[ownerId];
      if (recurrenceSummary !== undefined) {
        setRepeatEnabled(true);
        const due = existing.dueDate ?? snapshot.today;
        setRecurrence(defaultRecurrence(due, existing.dueTime));
      }
      setHydrated(true);
    };

    void hydrate();
  }, [existing, hydrated, snapshot, status, taskId]);

  const isOccurrence = existing?.seriesId !== null && existing?.seriesId !== undefined;

  const dueDateValue = dueDate ?? today;
  const canSave = title.trim().length > 0 && !saving;

  const close = (): void => navigation.goBack();

  const showError = (message: string): void => {
    setSaveError(message);
  };

  const buildReminder = (): ReminderInput | null => {
    if (reminderMode === 'none') return null;
    if (reminderMode === 'at_due') return { kind: 'relative', offsetMinutes: 0 };
    if (reminderMode === 'before') {
      return { kind: 'relative', offsetMinutes: -reminderMinutes };
    }
    if (reminderDate === null || reminderTime === null) {
      showError(t('tasks.validation.reminderNeedsDateTime'));
      return null;
    }
    return { kind: 'absolute', localDate: reminderDate, localTime: reminderTime };
  };

  const save = async (): Promise<void> => {
    setSaveError(null);
    if (title.trim().length === 0) {
      showError(t('tasks.validation.titleRequired'));
      return;
    }
    if (title.trim().length > MAX_TITLE) {
      showError(t('tasks.validation.titleTooLong'));
      return;
    }
    if (notes.length > MAX_NOTES) {
      showError(t('tasks.validation.notesTooLong'));
      return;
    }
    if (reminderMode !== 'none' && reminderMode !== 'custom' && dueDate === null) {
      showError(t('tasks.validation.reminderNeedsDueDate'));
      return;
    }
    if (repeatEnabled && dueDate === null) {
      showError(t('tasks.validation.repeatNeedsStartDate'));
      return;
    }
    if (repeatEnabled && recurrence.frequency === 'weekly' && recurrence.weekdays.length === 0) {
      showError(t('tasks.validation.weekdayRequired'));
      return;
    }
    if (reminderMode === 'custom' && (reminderDate === null || reminderTime === null)) {
      showError(t('tasks.validation.reminderNeedsDateTime'));
      return;
    }

    setSaving(true);
    try {
      const reminder = buildReminder();
      if (existing === null) {
        await store.createTask({
          draft: {
            title,
            notes,
            priority,
            ...(listId === null ? {} : { listId }),
            dueDate,
            dueTime,
          },
          reminder,
          recurrence: repeatEnabled
            ? buildRecurrenceInput(recurrence, dueDateValue, dueTime)
            : null,
        });
      } else {
        await store.updateTask(
          existing.id,
          {
            title,
            notes,
            priority,
            ...(listId === null ? {} : { listId }),
            dueDate,
            dueTime,
          },
          isOccurrence ? scope : 'series',
        );
        if (!isOccurrence) {
          await store.saveReminder(existing.id, reminder);
          await store.saveRecurrence(
            existing.id,
            repeatEnabled ? buildRecurrenceInput(recurrence, dueDateValue, dueTime) : null,
          );
        }
      }
      close();
    } catch (cause) {
      showError(cause instanceof Error ? cause.message : t('common.failure'));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (): void => {
    if (existing === null) return;
    Alert.alert(t('tasks.delete.confirmTitle'), t('tasks.delete.confirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('tasks.actions.delete'),
        style: 'destructive',
        onPress: () => {
          void store
            .deleteTask(existing.id)
            .then(() => {
              navigation.goBack();
            })
            .catch((cause: unknown) => {
              showError(cause instanceof Error ? cause.message : t('common.failure'));
            });
        },
      },
    ]);
  };

  if (status === 'loading' || (taskId !== null && !hydrated && status === 'ready')) {
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

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.surface, paddingTop: insets.top }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: theme.spacing.lg,
          paddingVertical: theme.spacing.md,
          gap: theme.spacing.md,
          borderBottomWidth: theme.sizes.borderHairline,
          borderBottomColor: theme.colors.border,
        }}
      >
        <AppButton
          label={t('common.cancel')}
          onPress={close}
          variant="ghost"
          accessibilityLabel={t('common.cancel')}
        />
        <AppText variant="heading" accessibilityRole="header" style={{ flex: 1 }}>
          {existing === null ? t('tasks.editor.createTitle') : t('tasks.editor.editTitle')}
        </AppText>
        <AppButton
          label={saving ? t('common.working') : t('tasks.actions.save')}
          onPress={() => void save()}
          disabled={!canSave}
          testID="save-task-button"
        />
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          padding: theme.spacing.lg,
          paddingBottom: insets.bottom + theme.spacing.xxl,
          gap: theme.spacing.lg,
        }}
      >
        {saveError === null ? null : (
          <AppText
            accessibilityRole="alert"
            accessibilityLiveRegion="assertive"
            color="error"
            variant="bodySmall"
          >
            {saveError}
          </AppText>
        )}

        <Field label={t('tasks.editor.titleLabel')}>
          <TextInput
            accessibilityLabel={t('tasks.editor.titleLabel')}
            value={title}
            onChangeText={setTitle}
            placeholder={t('tasks.editor.titlePlaceholder')}
            placeholderTextColor={theme.colors.textMuted}
            maxLength={MAX_TITLE}
            style={[
              styles.input,
              {
                borderColor: theme.colors.border,
                color: theme.colors.text,
                backgroundColor: theme.colors.surfaceRaised,
              },
            ]}
            testID="task-title-input"
          />
        </Field>

        <Field label={t('tasks.editor.notesLabel')}>
          <TextInput
            accessibilityLabel={t('tasks.editor.notesLabel')}
            value={notes}
            onChangeText={setNotes}
            placeholder={t('tasks.editor.notesPlaceholder')}
            placeholderTextColor={theme.colors.textMuted}
            multiline
            maxLength={MAX_NOTES}
            style={[
              styles.input,
              {
                minHeight: 96,
                textAlignVertical: 'top',
                borderColor: theme.colors.border,
                color: theme.colors.text,
                backgroundColor: theme.colors.surfaceRaised,
              },
            ]}
            testID="task-notes-input"
          />
        </Field>

        <Field label={t('tasks.editor.priorityLabel')}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {TASK_PRIORITIES.map(value => (
              <Chip
                key={value}
                label={t(`tasks.priority.${value}`)}
                selected={priority === value}
                onPress={() => setPriority(value)}
              />
            ))}
          </View>
        </Field>

        {snapshot === null ? null : (
          <Field label={t('tasks.editor.listLabel')}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
              {snapshot.lists.map(list => (
                <Chip
                  key={list.id}
                  label={list.name}
                  selected={listId === list.id}
                  onPress={() => setListId(list.id)}
                />
              ))}
            </View>
          </Field>
        )}

        <Field label={t('tasks.editor.dueLabel')}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            <Chip
              label={dueDate === null ? t('tasks.due.none') : formatLocalDateLabel(dueDate)}
              selected={dueDate !== null}
              onPress={() => {
                setCustomDate(dueDate ?? today);
                setPicker('date');
              }}
              testID="pick-date"
            />
            <Chip
              label={dueTime === null ? t('tasks.editor.allDay') : formatLocalTimeLabel(dueTime)}
              selected={dueTime !== null}
              onPress={() => {
                setCustomTime(dueTime ?? '09:00');
                setPicker('time');
              }}
              testID="pick-time"
            />
            {dueDate === null ? null : (
              <Chip
                label={t('tasks.editor.clearDate')}
                selected={false}
                onPress={() => {
                  setDueDate(null);
                  setDueTime(null);
                  if (reminderMode !== 'custom') setReminderMode('none');
                }}
              />
            )}
          </View>
        </Field>

        <Field label={t('tasks.editor.reminderLabel')}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            <Chip
              label={t('tasks.reminder.none')}
              selected={reminderMode === 'none'}
              onPress={() => setReminderMode('none')}
            />
            <Chip
              label={t('tasks.reminder.atDue')}
              selected={reminderMode === 'at_due'}
              onPress={() => setReminderMode('at_due')}
            />
            {[5, 10, 30, 60].map(minutes => (
              <Chip
                key={minutes}
                label={t('tasks.reminder.minutesBefore', { count: minutes })}
                selected={reminderMode === 'before' && reminderMinutes === minutes}
                onPress={() => {
                  setReminderMode('before');
                  setReminderMinutes(minutes);
                }}
              />
            ))}
            <Chip
              label={t('tasks.reminder.dayBefore')}
              selected={reminderMode === 'before' && reminderMinutes === 1_440}
              onPress={() => {
                setReminderMode('before');
                setReminderMinutes(1_440);
              }}
            />
            <Chip
              label={t('tasks.reminder.custom')}
              selected={reminderMode === 'custom'}
              onPress={() => {
                setReminderMode('custom');
                setReminderDate(reminderDate ?? dueDate ?? today);
                setReminderTime(reminderTime ?? dueTime ?? '09:00');
                setPicker('reminder');
              }}
            />
          </View>
          {reminderMode === 'custom' && reminderDate !== null && reminderTime !== null ? (
            <AppText variant="bodySmall" color="textMuted">
              {t('tasks.reminder.absoluteSummary', {
                date: formatLocalDateLabel(reminderDate),
                time: formatLocalTimeLabel(reminderTime),
              })}
            </AppText>
          ) : null}
        </Field>

        {isOccurrence ? (
          <Field label={t('tasks.editor.scopeLabel')}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
              {(['one', 'series', 'following'] as const).map(value => (
                <Chip
                  key={value}
                  label={t(`tasks.editor.scope.${value}`)}
                  selected={scope === value}
                  onPress={() => setScope(value)}
                />
              ))}
            </View>
            <AppText variant="bodySmall" color="textMuted">
              {t('tasks.editor.scopeHint')}
            </AppText>
          </Field>
        ) : (
          <Field label={t('tasks.editor.repeatLabel')}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
              <Switch
                accessibilityLabel={t('tasks.editor.repeatToggle')}
                value={repeatEnabled}
                onValueChange={value => {
                  if (value && dueDate === null) setDueDate(today);
                  setRepeatEnabled(value);
                }}
                testID="repeat-toggle"
              />
              <AppText variant="body" style={{ flex: 1 }}>
                {repeatEnabled ? t('tasks.recurrence.enabled') : t('tasks.recurrence.none')}
              </AppText>
              {repeatEnabled ? (
                <AppButton
                  label={t('tasks.recurrence.edit')}
                  variant="secondary"
                  onPress={() => setPicker('repeat')}
                  testID="edit-recurrence-button"
                />
              ) : null}
            </View>
          </Field>
        )}

        {existing === null ? null : (
          <AppButton
            label={t('tasks.actions.delete')}
            variant="danger"
            onPress={confirmDelete}
            accessibilityHint={t('tasks.delete.hint')}
          />
        )}
      </ScrollView>

      <DatePickerSheet
        visible={picker === 'date'}
        value={dueDate}
        custom={customDate}
        onChangeCustom={setCustomDate}
        today={today}
        onClose={() => setPicker(null)}
        onPick={value => {
          setDueDate(value);
          setPicker(null);
        }}
      />

      <TimePickerSheet
        visible={picker === 'time'}
        value={dueTime}
        custom={customTime}
        onChangeCustom={setCustomTime}
        onClose={() => setPicker(null)}
        onPick={value => {
          setDueTime(value);
          setPicker(null);
        }}
      />

      <ReminderSheet
        visible={picker === 'reminder'}
        date={reminderDate}
        time={reminderTime}
        dateLabel={customDate}
        timeLabel={customTime}
        onChangeDateLabel={setCustomDate}
        onChangeTimeLabel={setCustomTime}
        onPickDate={value => setReminderDate(value)}
        onPickTime={value => setReminderTime(value)}
        onClose={() => setPicker(null)}
      />

      <RecurrenceSheet
        visible={picker === 'repeat'}
        value={recurrence}
        onChange={setRecurrence}
        onClose={() => setPicker(null)}
      />
    </View>
  );
}

function Field({
  label,
  children,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.sm }}>
      <AppText variant="label" color="textMuted">
        {label}
      </AppText>
      {children}
    </View>
  );
}

function Chip({
  label,
  selected,
  onPress,
  testID,
}: {
  readonly label: string;
  readonly selected: boolean;
  readonly onPress: () => void;
  readonly testID?: string;
}): React.JSX.Element {
  const theme = useTheme();
  return (
    <AppButton
      label={label}
      onPress={onPress}
      variant={selected ? 'primary' : 'secondary'}
      selected={selected}
      style={{ minHeight: theme.sizes.touchMinimum }}
      {...(testID === undefined ? {} : { testID })}
    />
  );
}

function DatePickerSheet({
  visible,
  value,
  custom,
  onChangeCustom,
  today,
  onPick,
  onClose,
}: {
  readonly visible: boolean;
  readonly value: string | null;
  readonly custom: string;
  readonly onChangeCustom: (value: string) => void;
  readonly today: string;
  readonly onPick: (value: string) => void;
  readonly onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const theme = useTheme();
  const days = Array.from({ length: 14 }, (_, index) => addDays(today, index));

  return (
    <Sheet visible={visible} title={t('tasks.picker.dateTitle')} onClose={onClose}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
        {[0, 1, 7].map(offset => (
          <Chip
            key={offset}
            label={
              offset === 0
                ? t('tasks.due.today')
                : offset === 1
                  ? t('tasks.due.tomorrow')
                  : t('tasks.due.nextWeek')
            }
            selected={value === addDays(today, offset)}
            onPress={() => onPick(addDays(today, offset))}
          />
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
        {days.map(day => (
          <Chip
            key={day}
            label={formatLocalDateLabel(day)}
            selected={value === day}
            onPress={() => onPick(day)}
          />
        ))}
      </View>
      <Field label={t('tasks.picker.customDate')}>
        <TextInput
          accessibilityLabel={t('tasks.picker.customDate')}
          value={custom}
          onChangeText={onChangeCustom}
          placeholder="YYYY-MM-DD"
          autoCapitalize="none"
          style={[
            styles.input,
            {
              borderColor: theme.colors.border,
              color: theme.colors.text,
              backgroundColor: theme.colors.surfaceRaised,
            },
          ]}
        />
      </Field>
      <AppButton
        label={t('tasks.picker.useCustom')}
        onPress={() => onPick(custom)}
        disabled={!/^\d{4}-\d{2}-\d{2}$/.test(custom)}
      />
    </Sheet>
  );
}

function TimePickerSheet({
  visible,
  value,
  custom,
  onChangeCustom,
  onPick,
  onClose,
}: {
  readonly visible: boolean;
  readonly value: string | null;
  readonly custom: string;
  readonly onChangeCustom: (value: string) => void;
  readonly onPick: (value: string | null) => void;
  readonly onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const theme = useTheme();
  const slots = Array.from({ length: 34 }, (_, index) => {
    const total = 6 * 60 + index * 30;
    const hour = Math.floor(total / 60);
    const minute = total % 60;
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  });

  return (
    <Sheet visible={visible} title={t('tasks.picker.timeTitle')} onClose={onClose}>
      <Chip
        label={t('tasks.editor.allDay')}
        selected={value === null}
        onPress={() => onPick(null)}
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
        {slots.map(slot => (
          <Chip
            key={slot}
            label={formatLocalTimeLabel(slot)}
            selected={value === slot}
            onPress={() => onPick(slot)}
          />
        ))}
      </View>
      <Field label={t('tasks.picker.customTime')}>
        <TextInput
          accessibilityLabel={t('tasks.picker.customTime')}
          value={custom}
          onChangeText={onChangeCustom}
          placeholder="HH:mm"
          autoCapitalize="none"
          style={[
            styles.input,
            {
              borderColor: theme.colors.border,
              color: theme.colors.text,
              backgroundColor: theme.colors.surfaceRaised,
            },
          ]}
        />
      </Field>
      <AppButton
        label={t('tasks.picker.useCustom')}
        onPress={() => onPick(custom)}
        disabled={!/^\d{2}:\d{2}$/.test(custom)}
      />
    </Sheet>
  );
}

function ReminderSheet({
  visible,
  date,
  time,
  dateLabel,
  timeLabel,
  onChangeDateLabel,
  onChangeTimeLabel,
  onPickDate,
  onPickTime,
  onClose,
}: {
  readonly visible: boolean;
  readonly date: string | null;
  readonly time: string | null;
  readonly dateLabel: string;
  readonly timeLabel: string;
  readonly onChangeDateLabel: (value: string) => void;
  readonly onChangeTimeLabel: (value: string) => void;
  readonly onPickDate: (value: string) => void;
  readonly onPickTime: (value: string) => void;
  readonly onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <Sheet
      visible={visible}
      title={t('tasks.picker.reminderTitle')}
      onClose={onClose}
      footer={<AppButton label={t('tasks.actions.done')} onPress={onClose} />}
    >
      <Field label={t('tasks.picker.customDate')}>
        <TextInput
          accessibilityLabel={t('tasks.picker.customDate')}
          value={dateLabel}
          onChangeText={onChangeDateLabel}
          placeholder="YYYY-MM-DD"
          autoCapitalize="none"
          style={[
            styles.input,
            {
              borderColor: theme.colors.border,
              color: theme.colors.text,
              backgroundColor: theme.colors.surfaceRaised,
            },
          ]}
        />
      </Field>
      <Field label={t('tasks.picker.customTime')}>
        <TextInput
          accessibilityLabel={t('tasks.picker.customTime')}
          value={timeLabel}
          onChangeText={onChangeTimeLabel}
          placeholder="HH:mm"
          autoCapitalize="none"
          style={[
            styles.input,
            {
              borderColor: theme.colors.border,
              color: theme.colors.text,
              backgroundColor: theme.colors.surfaceRaised,
            },
          ]}
        />
      </Field>
      <AppButton
        label={t('tasks.picker.useCustom')}
        onPress={() => {
          onPickDate(dateLabel);
          onPickTime(timeLabel);
        }}
        disabled={!/^\d{4}-\d{2}-\d{2}$/.test(dateLabel) || !/^\d{2}:\d{2}$/.test(timeLabel)}
      />
      {date === null || time === null ? null : (
        <AppText variant="bodySmall" color="textMuted">
          {t('tasks.reminder.absoluteSummary', {
            date: formatLocalDateLabel(date),
            time: formatLocalTimeLabel(time),
          })}
        </AppText>
      )}
    </Sheet>
  );
}

function RecurrenceSheet({
  visible,
  value,
  onChange,
  onClose,
}: {
  readonly visible: boolean;
  readonly value: RecurrenceDraft;
  readonly onChange: (value: RecurrenceDraft) => void;
  readonly onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const theme = useTheme();
  const update = (patch: Partial<RecurrenceDraft>): void => onChange({ ...value, ...patch });
  const frequencies: RecurrenceFrequency[] = ['daily', 'weekdays', 'weekly', 'monthly', 'yearly'];

  return (
    <Sheet
      visible={visible}
      title={t('tasks.recurrence.editorTitle')}
      onClose={onClose}
      footer={<AppButton label={t('tasks.actions.done')} onPress={onClose} />}
    >
      <Field label={t('tasks.recurrence.frequencyLabel')}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
          {frequencies.map(frequency => (
            <Chip
              key={frequency}
              label={t(`tasks.recurrence.frequency.${frequency}`)}
              selected={value.frequency === frequency}
              onPress={() => update({ frequency })}
            />
          ))}
        </View>
      </Field>

      <Field label={t('tasks.recurrence.intervalLabel')}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
          <AppButton
            label={t('tasks.recurrence.decrease')}
            onPress={() => update({ interval: Math.max(1, value.interval - 1) })}
            variant="secondary"
            accessibilityLabel={t('tasks.recurrence.decrease')}
          />
          <AppText variant="body">{String(value.interval)}</AppText>
          <AppButton
            label={t('tasks.recurrence.increase')}
            onPress={() => update({ interval: Math.min(999, value.interval + 1) })}
            variant="secondary"
            accessibilityLabel={t('tasks.recurrence.increase')}
          />
        </View>
      </Field>

      {value.frequency === 'weekly' ? (
        <Field label={t('tasks.recurrence.weekdayLabel')}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {[1, 2, 3, 4, 5, 6, 7].map(day => (
              <Chip
                key={day}
                label={weekdayLabel(day, t)}
                selected={value.weekdays.includes(day)}
                onPress={() =>
                  update({
                    weekdays: value.weekdays.includes(day)
                      ? value.weekdays.filter(entry => entry !== day)
                      : [...value.weekdays, day],
                  })
                }
              />
            ))}
          </View>
        </Field>
      ) : null}

      {value.frequency === 'monthly' ? (
        <Field label={t('tasks.recurrence.monthlyLabel')}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            <Chip
              label={t('tasks.recurrence.monthlyDay')}
              selected={value.monthlyMode === 'day_of_month'}
              onPress={() => update({ monthlyMode: 'day_of_month' })}
            />
            <Chip
              label={t('tasks.recurrence.monthlyNth')}
              selected={value.monthlyMode === 'nth_weekday'}
              onPress={() => update({ monthlyMode: 'nth_weekday' })}
            />
          </View>
          {value.monthlyMode === 'day_of_month' ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
              <AppButton
                label={t('tasks.recurrence.decrease')}
                variant="secondary"
                onPress={() => update({ monthDay: Math.max(1, value.monthDay - 1) })}
              />
              <AppText variant="body">{String(value.monthDay)}</AppText>
              <AppButton
                label={t('tasks.recurrence.increase')}
                variant="secondary"
                onPress={() => update({ monthDay: Math.min(31, value.monthDay + 1) })}
              />
            </View>
          ) : (
            <>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
                {[1, 2, 3, 4, -1].map(nth => (
                  <Chip
                    key={nth}
                    label={
                      nth === -1
                        ? t('tasks.recurrence.nthLast')
                        : t('tasks.recurrence.nth', { count: nth })
                    }
                    selected={value.nth === nth}
                    onPress={() => update({ nth })}
                  />
                ))}
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
                {[1, 2, 3, 4, 5, 6, 7].map(day => (
                  <Chip
                    key={day}
                    label={weekdayLabel(day, t)}
                    selected={value.weekday === day}
                    onPress={() => update({ weekday: day })}
                  />
                ))}
              </View>
            </>
          )}
        </Field>
      ) : null}

      <Field label={t('tasks.recurrence.endLabel')}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
          <Chip
            label={t('tasks.recurrence.endNever')}
            selected={value.endMode === 'never'}
            onPress={() => update({ endMode: 'never' })}
          />
          <Chip
            label={t('tasks.recurrence.endDate')}
            selected={value.endMode === 'date'}
            onPress={() => update({ endMode: 'date' })}
          />
          <Chip
            label={t('tasks.recurrence.endCount')}
            selected={value.endMode === 'count'}
            onPress={() => update({ endMode: 'count' })}
          />
        </View>
        {value.endMode === 'date' ? (
          <TextInput
            accessibilityLabel={t('tasks.recurrence.endDate')}
            value={value.endDate}
            onChangeText={text => update({ endDate: text })}
            placeholder="YYYY-MM-DD"
            autoCapitalize="none"
            style={[
              styles.input,
              {
                borderColor: theme.colors.border,
                color: theme.colors.text,
                backgroundColor: theme.colors.surfaceRaised,
              },
            ]}
          />
        ) : null}
        {value.endMode === 'count' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
            <AppButton
              label={t('tasks.recurrence.decrease')}
              variant="secondary"
              onPress={() => update({ endAfterCount: Math.max(1, value.endAfterCount - 1) })}
            />
            <AppText variant="body">{String(value.endAfterCount)}</AppText>
            <AppButton
              label={t('tasks.recurrence.increase')}
              variant="secondary"
              onPress={() => update({ endAfterCount: Math.min(999, value.endAfterCount + 1) })}
            />
          </View>
        ) : null}
      </Field>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
        <Switch
          accessibilityLabel={t('tasks.recurrence.repeatAfterCompletion')}
          value={value.repeatAfterCompletion}
          onValueChange={repeatAfterCompletion => update({ repeatAfterCompletion })}
        />
        <AppText variant="body" style={{ flex: 1 }}>
          {t('tasks.recurrence.repeatAfterCompletion')}
        </AppText>
      </View>
    </Sheet>
  );
}
