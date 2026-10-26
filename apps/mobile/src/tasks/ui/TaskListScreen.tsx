import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { AppButton } from '@/design/AppButton';
import { AppText } from '@/design/AppText';
import { useTheme } from '@/design/ThemeProvider';
import type { RootStackParamList } from '@/navigation/types';
import { systemClock } from '@/core/time/Clock';

import type { TaskFilter } from '../repository';
import { useTaskStore } from '../store';
import { useTaskSnapshot } from '../useTaskSnapshot';
import { EmptyState, ErrorState, LoadingState } from './States';
import { TaskRow } from './TaskRow';
import { UndoBanner } from './UndoBanner';

export interface TaskListScreenProps {
  readonly filter: TaskFilter;
  readonly title: string;
  readonly emptyTitle: string;
  readonly emptyDescription: string;
  readonly showAdd?: boolean;
}

interface UndoState {
  readonly message: string;
  readonly token: string;
  readonly kind: 'complete' | 'delete';
}

export function TaskListScreen({
  filter,
  title,
  emptyTitle,
  emptyDescription,
  showAdd = true,
}: TaskListScreenProps): React.JSX.Element {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const store = useTaskStore();
  const { status, snapshot, error, reload } = useTaskSnapshot(filter);
  const [undoState, setUndoState] = useState<UndoState | null>(null);
  const now = systemClock.now().getTime();

  const handleComplete = (taskId: string): void => {
    void store
      .completeTask(taskId)
      .then(handle => {
        if (handle.undoToken === '') return;
        setUndoState({
          message: t('tasks.undo.completed'),
          token: handle.undoToken,
          kind: 'complete',
        });
      })
      .catch(() => {
        setUndoState(null);
      });
  };

  const handleUndo = (): void => {
    if (undoState === null) return;
    const token = undoState.token;
    const kind = undoState.kind;
    setUndoState(null);
    void (kind === 'complete' ? store.undoComplete(token) : store.undoDelete(token));
  };

  const tasks = snapshot?.tasks ?? [];
  const today = snapshot?.today ?? '';

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.surface }}>
      <View
        style={{
          paddingTop: insets.top,
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: theme.spacing.md,
          backgroundColor: theme.colors.surfaceRaised,
          borderBottomWidth: theme.sizes.borderHairline,
          borderBottomColor: theme.colors.border,
          gap: theme.spacing.xs,
        }}
      >
        <AppText variant="title" accessibilityRole="header">
          {title}
        </AppText>
        <AppText variant="bodySmall" color="textMuted">
          {snapshot === null
            ? t('tasks.state.loading')
            : t('tasks.list.count', { count: tasks.length })}
        </AppText>
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

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + theme.spacing.xxl }}>
        {status === 'loading' ? <LoadingState /> : null}
        {status === 'error' ? (
          <ErrorState
            message={error?.message ?? t('common.failure')}
            onRetry={() => void reload()}
          />
        ) : null}
        {status === 'ready' && tasks.length === 0 ? (
          <EmptyState title={emptyTitle} description={emptyDescription} />
        ) : null}
        {status === 'ready'
          ? tasks.map(entry => (
              <TaskRow
                key={entry.task.id}
                entry={entry}
                today={today}
                now={now}
                recurrence={snapshot?.recurrence[entry.task.id]}
                onOpen={() => navigation.navigate('TaskDetail', { taskId: entry.task.id })}
                onComplete={() => handleComplete(entry.task.id)}
              />
            ))
          : null}
      </ScrollView>

      {showAdd ? (
        <View
          style={{
            position: 'absolute',
            right: theme.spacing.lg,
            bottom: insets.bottom + theme.spacing.lg,
          }}
        >
          <AppButton
            label={t('tasks.actions.new')}
            onPress={() => navigation.navigate('TaskEditor', {})}
            accessibilityHint={t('tasks.actions.newHint')}
            testID="new-task-button"
          />
        </View>
      ) : null}
    </View>
  );
}
