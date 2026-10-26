import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { AppButton } from '@/design/AppButton';
import { AppText } from '@/design/AppText';
import { useTheme } from '@/design/ThemeProvider';
import type { RootStackParamList } from '@/navigation/types';
import { formatLocalDateLabel, formatLocalTimeLabel } from '@/recurrence/time';

import { useTaskStore } from '../store';
import { useTaskDetail } from '../useTaskDetail';
import {
  dueLabel,
  priorityLabel,
  recurrenceLabel,
  reminderLabel,
  scheduleStateLabel,
} from './format';
import { ErrorState, LoadingState } from './States';
import { UndoBanner } from './UndoBanner';

interface UndoState {
  readonly message: string;
  readonly token: string;
  readonly kind: 'complete' | 'delete';
}

export function TaskDetailScreen(): React.JSX.Element {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'TaskDetail'>>();
  const store = useTaskStore();
  const taskId = route.params?.taskId ?? null;
  const { status, detail, error, reload } = useTaskDetail(taskId);

  const [undoState, setUndoState] = useState<UndoState | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [subtaskTitle, setSubtaskTitle] = useState('');

  const fail = (cause: unknown): void => {
    setActionError(cause instanceof Error ? cause.message : t('common.failure'));
  };

  const handleComplete = (): void => {
    if (detail === null) return;
    setActionError(null);
    void store
      .completeTask(detail.task.id)
      .then(handle => {
        if (handle.undoToken === '') return;
        setUndoState({
          message: t('tasks.undo.completed'),
          token: handle.undoToken,
          kind: 'complete',
        });
      })
      .catch(fail);
  };

  const handleUndo = (): void => {
    if (undoState === null) return;
    const { token, kind } = undoState;
    setUndoState(null);
    void (kind === 'complete' ? store.undoComplete(token) : store.undoDelete(token)).catch(fail);
  };

  const handleDelete = (): void => {
    if (detail === null) return;
    Alert.alert(t('tasks.delete.confirmTitle'), t('tasks.delete.confirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('tasks.actions.delete'),
        style: 'destructive',
        onPress: () => {
          setActionError(null);
          void store
            .deleteTask(detail.task.id)
            .then(handle => {
              setUndoState({
                message: t('tasks.undo.deleted'),
                token: handle.undoToken,
                kind: 'delete',
              });
            })
            .catch(fail);
        },
      },
    ]);
  };

  const handleSkip = (): void => {
    if (detail === null) return;
    setActionError(null);
    void store.skipOccurrence(detail.task.id).catch(fail);
  };

  const handleArchive = (): void => {
    if (detail === null) return;
    setActionError(null);
    void store
      .archiveTask(detail.task.id)
      .then(() => navigation.goBack())
      .catch(fail);
  };

  const handleAddSubtask = (): void => {
    if (detail === null) return;
    const title = subtaskTitle.trim();
    if (title.length === 0) return;
    setActionError(null);
    void store
      .addSubtask(detail.task.id, title)
      .then(() => setSubtaskTitle(''))
      .catch(fail);
  };

  if (status === 'loading') {
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

  if (detail === null) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: theme.colors.surface,
          paddingTop: insets.top,
          padding: theme.spacing.lg,
          gap: theme.spacing.lg,
        }}
      >
        <AppText variant="heading" accessibilityRole="header">
          {t('tasks.detail.missingTitle')}
        </AppText>
        <AppText variant="body" color="textMuted">
          {t('tasks.detail.missingBody')}
        </AppText>
        <AppButton label={t('common.back')} onPress={() => navigation.goBack()} />
      </View>
    );
  }

  const { task, subtasks, reminders, recurrence } = detail;
  const completed = task.status === 'done';
  const deleted = task.deletedAt !== null;
  const due = task.dueDate === null ? null : dueLabel(task.dueDate, task.dueTime, detail.today, t);
  const reminder = reminders[0];
  const reminderSummary = reminderLabel(reminder, t);
  const reminderState = scheduleStateLabel(reminder?.scheduleState ?? null, t);
  const repeat = recurrenceLabel(recurrence ?? undefined, t);
  const completedSubtasks = subtasks.filter(subtask => subtask.isCompleted).length;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.surface, paddingTop: insets.top }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.md,
          paddingHorizontal: theme.spacing.lg,
          paddingVertical: theme.spacing.md,
          borderBottomWidth: theme.sizes.borderHairline,
          borderBottomColor: theme.colors.border,
        }}
      >
        <AppButton
          label={t('common.back')}
          onPress={() => navigation.goBack()}
          variant="ghost"
          accessibilityLabel={t('common.back')}
        />
        <AppText variant="heading" accessibilityRole="header" style={{ flex: 1 }}>
          {t('tasks.detail.title')}
        </AppText>
        <AppButton
          label={t('tasks.actions.edit')}
          onPress={() => navigation.navigate('TaskEditor', { taskId: task.id })}
          accessibilityHint={t('tasks.detail.editHint')}
          testID="edit-task-button"
        />
      </View>

      {undoState === null ? null : (
        <View style={{ paddingTop: theme.spacing.sm }}>
          <UndoBanner
            message={undoState.message}
            onUndo={handleUndo}
            onDismiss={() => setUndoState(null)}
          />
        </View>
      )}

      {actionError === null ? null : (
        <AppText
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
          color="error"
          variant="bodySmall"
          style={{ paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.sm }}
        >
          {actionError}
        </AppText>
      )}

      <ScrollView
        contentContainerStyle={{
          padding: theme.spacing.lg,
          paddingBottom: insets.bottom + theme.spacing.xxl,
          gap: theme.spacing.lg,
        }}
      >
        {deleted ? (
          <View
            accessibilityLiveRegion="polite"
            style={{
              padding: theme.spacing.md,
              borderRadius: theme.radius.md,
              backgroundColor: theme.colors.warningSurface,
            }}
          >
            <AppText variant="bodySmall" color="onWarning">
              {t('tasks.detail.deletedNotice')}
            </AppText>
          </View>
        ) : null}

        <AppText
          variant="title"
          style={{
            textDecorationLine: completed ? 'line-through' : 'none',
            color: completed ? theme.colors.textMuted : theme.colors.text,
          }}
        >
          {task.title}
        </AppText>

        {task.notes.length === 0 ? null : (
          <AppText variant="body" color="textMuted">
            {task.notes}
          </AppText>
        )}

        <View
          style={{
            padding: theme.spacing.md,
            borderRadius: theme.radius.md,
            backgroundColor: theme.colors.surfaceRaised,
            gap: theme.spacing.sm,
          }}
        >
          {due === null ? (
            <AppText variant="bodySmall" color="textMuted">
              {t('tasks.detail.noDue')}
            </AppText>
          ) : (
            <AppText variant="bodySmall">{t('tasks.detail.due', { when: due })}</AppText>
          )}
          <AppText variant="bodySmall">
            {t('tasks.detail.priority', { priority: priorityLabel(task, t) })}
          </AppText>
          {detail.listName === null ? null : (
            <AppText variant="bodySmall">
              {t('tasks.detail.list', { name: detail.listName })}
            </AppText>
          )}
          <AppText variant="bodySmall">
            {t('tasks.detail.status', { status: t(`tasks.status.${task.status}`) })}
          </AppText>
          {subtasks.length === 0 ? null : (
            <AppText variant="bodySmall">
              {t('tasks.subtasks.progress', {
                done: completedSubtasks,
                total: subtasks.length,
              })}
            </AppText>
          )}
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
          <AppButton
            label={completed ? t('tasks.detail.completed') : t('tasks.actions.complete')}
            onPress={handleComplete}
            disabled={completed || deleted}
            accessibilityHint={t('tasks.detail.completeHint')}
            testID="detail-complete-button"
          />
          {task.seriesId === null || deleted ? null : (
            <AppButton
              label={t('tasks.actions.skip')}
              onPress={handleSkip}
              variant="secondary"
              accessibilityHint={t('tasks.detail.skipHint')}
            />
          )}
          {deleted ? null : (
            <AppButton
              label={t('tasks.actions.archive')}
              onPress={handleArchive}
              variant="secondary"
            />
          )}
          <AppButton
            label={t('tasks.actions.delete')}
            onPress={handleDelete}
            variant="danger"
            disabled={deleted}
            accessibilityHint={t('tasks.delete.hint')}
          />
        </View>

        <View style={{ gap: theme.spacing.sm }}>
          <AppText variant="label" color="textMuted" accessibilityRole="header">
            {t('tasks.subtasks.title')}
          </AppText>
          {subtasks.length === 0 ? (
            <AppText variant="bodySmall" color="textMuted">
              {t('tasks.subtasks.empty')}
            </AppText>
          ) : (
            subtasks.map(subtask => (
              <View
                key={subtask.id}
                style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}
              >
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: subtask.isCompleted }}
                  accessibilityLabel={t('tasks.subtasks.toggle', { title: subtask.title })}
                  onPress={() => {
                    void store.toggleSubtask(subtask.id).catch(fail);
                  }}
                  testID={`subtask-${subtask.id}`}
                  style={{
                    minHeight: theme.sizes.touchMinimum,
                    minWidth: theme.sizes.touchMinimum,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <View
                    style={{
                      width: theme.sizes.iconMedium,
                      height: theme.sizes.iconMedium,
                      borderRadius: theme.radius.sm,
                      borderWidth: 2,
                      borderColor: subtask.isCompleted
                        ? theme.colors.success
                        : theme.colors.borderStrong,
                      backgroundColor: subtask.isCompleted
                        ? theme.colors.success
                        : theme.colors.surface,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {subtask.isCompleted ? (
                      <AppText variant="caption" color="onSuccess">
                        {t('tasks.subtasks.checkmark')}
                      </AppText>
                    ) : null}
                  </View>
                </Pressable>
                <AppText
                  variant="body"
                  style={{
                    flex: 1,
                    textDecorationLine: subtask.isCompleted ? 'line-through' : 'none',
                    color: subtask.isCompleted ? theme.colors.textMuted : theme.colors.text,
                  }}
                >
                  {subtask.title}
                </AppText>
                <AppButton
                  label={t('tasks.subtasks.remove')}
                  onPress={() => {
                    void store.deleteSubtask(subtask.id).catch(fail);
                  }}
                  variant="ghost"
                  accessibilityLabel={t('tasks.subtasks.removeA11y', { title: subtask.title })}
                />
              </View>
            ))
          )}
          {deleted ? null : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
              <TextInput
                accessibilityLabel={t('tasks.subtasks.inputLabel')}
                value={subtaskTitle}
                onChangeText={setSubtaskTitle}
                placeholder={t('tasks.subtasks.placeholder')}
                placeholderTextColor={theme.colors.textMuted}
                maxLength={200}
                style={{
                  flex: 1,
                  minHeight: 48,
                  borderRadius: theme.radius.md,
                  borderWidth: theme.sizes.borderHairline,
                  borderColor: theme.colors.border,
                  paddingHorizontal: theme.spacing.md,
                  color: theme.colors.text,
                  backgroundColor: theme.colors.surfaceRaised,
                }}
                testID="subtask-input"
              />
              <AppButton
                label={t('tasks.subtasks.add')}
                onPress={handleAddSubtask}
                disabled={subtaskTitle.trim().length === 0}
                testID="add-subtask-button"
              />
            </View>
          )}
        </View>

        <View style={{ gap: theme.spacing.xs }}>
          <AppText variant="label" color="textMuted" accessibilityRole="header">
            {t('tasks.detail.reminderHeading')}
          </AppText>
          {reminderSummary === null ? (
            <AppText variant="bodySmall" color="textMuted">
              {t('tasks.reminder.none')}
            </AppText>
          ) : (
            <>
              <AppText variant="bodySmall">{reminderSummary}</AppText>
              {reminderState === null ? null : (
                <AppText variant="bodySmall" color="textMuted">
                  {t('tasks.detail.reminderState', { state: reminderState })}
                </AppText>
              )}
              {reminder === undefined || reminder.nextTriggerAt === null ? null : (
                <AppText variant="bodySmall" color="textMuted">
                  {t('tasks.detail.reminderNext', {
                    when: formatLocalDateLabel(
                      new Date(reminder.nextTriggerAt).toISOString().slice(0, 10),
                    ),
                    time: formatLocalTimeLabel(
                      new Date(reminder.nextTriggerAt).toISOString().slice(11, 16),
                    ),
                  })}
                </AppText>
              )}
            </>
          )}
        </View>

        <View style={{ gap: theme.spacing.xs }}>
          <AppText variant="label" color="textMuted" accessibilityRole="header">
            {t('tasks.detail.recurrenceHeading')}
          </AppText>
          {repeat === null ? (
            <AppText variant="bodySmall" color="textMuted">
              {t('tasks.recurrence.none')}
            </AppText>
          ) : (
            <>
              <AppText variant="bodySmall">{repeat}</AppText>
              {recurrence === null || recurrence.nextDate === null ? null : (
                <AppText variant="bodySmall" color="textMuted">
                  {t('tasks.detail.recurrenceNext', {
                    when: dueLabel(recurrence.nextDate, recurrence.nextTime, detail.today, t),
                  })}
                </AppText>
              )}
              {recurrence === null ? null : (
                <AppText variant="bodySmall" color="textMuted">
                  {t('tasks.detail.recurrenceCompleted', {
                    count: recurrence.completedCount,
                  })}
                </AppText>
              )}
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
