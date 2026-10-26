import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/design/AppText';
import { useTheme } from '@/design/ThemeProvider';

import type { RecurrenceStatusSummary, TaskWithDetails } from '../types';
import { dueLabel, isOverdue, priorityLabel, recurrenceLabel } from './format';

export interface TaskRowProps {
  readonly entry: TaskWithDetails;
  readonly today: string;
  readonly now: number;
  readonly recurrence?: RecurrenceStatusSummary | undefined;
  readonly onOpen: () => void;
  readonly onComplete: () => void;
}

/** Accessible task row. The completion checkbox is a separate 48dp target. */
export function TaskRow({
  entry,
  today,
  now,
  recurrence,
  onOpen,
  onComplete,
}: TaskRowProps): React.JSX.Element {
  const theme = useTheme();
  const { t } = useTranslation();
  const { task, subtasks } = entry;
  const completed = task.status === 'done';
  const overdue = isOverdue(task, today, now);
  const repeat = recurrenceLabel(recurrence, t);
  const completedSubtasks = subtasks.filter(subtask => subtask.isCompleted).length;

  const due = task.dueDate === null ? null : dueLabel(task.dueDate, task.dueTime, today, t);

  const rowLabel = [
    task.title,
    due,
    overdue ? t('tasks.badge.overdue') : null,
    priorityLabel(task, t),
    repeat,
    subtasks.length === 0
      ? null
      : t('tasks.subtasks.progress', { done: completedSubtasks, total: subtasks.length }),
  ]
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join('. ');

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        paddingHorizontal: theme.spacing.lg,
        borderBottomWidth: theme.sizes.borderHairline,
        borderBottomColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
      }}
    >
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: completed }}
        accessibilityLabel={
          completed
            ? t('tasks.a11y.markIncomplete', { title: task.title })
            : t('tasks.a11y.markComplete', { title: task.title })
        }
        onPress={onComplete}
        testID={`complete-${task.id}`}
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
            borderColor: completed ? theme.colors.success : theme.colors.borderStrong,
            backgroundColor: completed ? theme.colors.success : theme.colors.surface,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {completed ? (
            <AppText variant="caption" color="onSuccess">
              {t('tasks.subtasks.checkmark')}
            </AppText>
          ) : null}
        </View>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={rowLabel}
        accessibilityHint={t('tasks.a11y.openHint')}
        onPress={onOpen}
        testID={`task-${task.id}`}
        style={({ pressed }) => ({
          flex: 1,
          minHeight: theme.sizes.touchMinimum,
          paddingVertical: theme.spacing.md,
          justifyContent: 'center',
          gap: theme.spacing.xs,
          backgroundColor: pressed ? theme.colors.surfaceSunken : undefined,
        })}
      >
        <AppText
          variant="body"
          style={{
            textDecorationLine: completed ? 'line-through' : 'none',
            color: completed ? theme.colors.textMuted : theme.colors.text,
          }}
        >
          {task.title}
        </AppText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
          {due === null ? null : (
            <AppText variant="bodySmall" color={overdue ? 'error' : 'textMuted'}>
              {due}
            </AppText>
          )}
          {task.priority === 'none' ? null : (
            <AppText variant="bodySmall" color="textMuted">
              {priorityLabel(task, t)}
            </AppText>
          )}
          {repeat === null ? null : (
            <AppText variant="bodySmall" color="textMuted">
              {repeat}
            </AppText>
          )}
          {subtasks.length === 0 ? null : (
            <AppText variant="bodySmall" color="textMuted">
              {t('tasks.subtasks.progress', {
                done: completedSubtasks,
                total: subtasks.length,
              })}
            </AppText>
          )}
        </View>
      </Pressable>
    </View>
  );
}
