import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { fireEvent, render, screen, userEvent, waitFor } from '@testing-library/react-native';

import '@/i18n';

import { ThemeProvider } from '@/design/ThemeProvider';
import type { RootStackParamList } from '@/navigation/types';

import {
  createInMemoryTaskStore,
  IN_MEMORY_LIST_ID,
  type InMemoryTaskStore,
} from '../testing/inMemoryTaskStore';
import type { TaskStore } from '../store';
import { TaskStoreProvider } from '../TaskStoreProvider';
import type { Task, TaskPriority } from '../types';
import { TaskEditorScreen } from './TaskEditorScreen';
import { TaskListScreen } from './TaskListScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

interface TaskOverrides {
  readonly id: string;
  readonly title: string;
  readonly priority?: TaskPriority;
  readonly dueDate?: string | null;
}

function makeTask({ id, title, priority = 'none', dueDate = null }: TaskOverrides): Task {
  return {
    id,
    listId: IN_MEMORY_LIST_ID,
    seriesId: null,
    title,
    notes: '',
    status: 'todo',
    priority,
    dueDate,
    dueTime: null,
    dueAt: null,
    isAllDay: true,
    occurrenceDate: null,
    isRecurrenceTemplate: false,
    sortOrder: 0,
    completedAt: null,
    archivedAt: null,
    deletedAt: null,
    createdAt: 1,
    updatedAt: 1,
  };
}

function StubScreen(): React.JSX.Element {
  return <></>;
}

function renderInbox(store: TaskStore): ReturnType<typeof render> {
  return render(
    <ThemeProvider mode="light">
      <TaskStoreProvider store={store}>
        <NavigationContainer>
          <Stack.Navigator initialRouteName="Main" screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Main">
              {() => (
                <TaskListScreen
                  filter="inbox"
                  title="Inbox"
                  emptyTitle="No tasks yet"
                  emptyDescription="Create your first task."
                />
              )}
            </Stack.Screen>
            <Stack.Screen name="TaskDetail" component={StubScreen} />
            <Stack.Screen name="TaskEditor" component={StubScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </TaskStoreProvider>
    </ThemeProvider>,
  );
}

function renderEditor(store: TaskStore): ReturnType<typeof render> {
  return render(
    <ThemeProvider mode="light">
      <TaskStoreProvider store={store}>
        <NavigationContainer>
          <Stack.Navigator initialRouteName="TaskEditor" screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Main" component={StubScreen} />
            <Stack.Screen name="TaskDetail" component={StubScreen} />
            <Stack.Screen name="TaskEditor" component={TaskEditorScreen} initialParams={{}} />
          </Stack.Navigator>
        </NavigationContainer>
      </TaskStoreProvider>
    </ThemeProvider>,
  );
}

describe('task list interactions', () => {
  it('renders an accessible row and a 48dp completion checkbox', async () => {
    const store: InMemoryTaskStore = createInMemoryTaskStore();
    store.seed([makeTask({ id: 'task-a', title: 'Buy milk', priority: 'high' })]);

    await renderInbox(store);

    const row = await screen.findByRole('button', { name: 'Buy milk. High priority' });
    expect(row.props['accessibilityHint']).toBe('Opens the task detail');

    const checkbox = screen.getByRole('checkbox', { name: 'Mark Buy milk complete' });
    expect(checkbox.props['accessibilityState']).toEqual({ checked: false });
    expect(checkbox.props['style']).toEqual(
      expect.objectContaining({ minHeight: 48, minWidth: 48 }),
    );
  });

  it('completes a task and restores it through undo', async () => {
    const user = userEvent.setup();
    const store = createInMemoryTaskStore();
    store.seed([makeTask({ id: 'task-a', title: 'Buy milk' })]);

    await renderInbox(store);
    await screen.findByText('Buy milk');

    await user.press(screen.getByTestId('complete-task-a'));

    expect(await screen.findByText('Task completed.')).toBeTruthy();
    expect(store.completeCalls).toEqual(['task-a']);
    await waitFor(() => {
      expect(screen.queryByText('Buy milk')).toBeNull();
    });

    await user.press(screen.getByTestId('undo-button'));

    await waitFor(() => {
      expect(store.undoCompleteCalls).toEqual(['undo-complete-task-a']);
    });
    expect(await screen.findByText('Buy milk')).toBeTruthy();
    expect(store.tasks[0]?.status).toBe('todo');
  });

  it('shows the empty state when nothing is due', async () => {
    const store = createInMemoryTaskStore();

    await renderInbox(store);

    expect(await screen.findByText('No tasks yet')).toBeTruthy();
    expect(screen.getByText('Create your first task.')).toBeTruthy();
  });
});

describe('task editor', () => {
  it('creates a task with a floating local due date', async () => {
    const store = createInMemoryTaskStore();

    await renderEditor(store);
    const input = await screen.findByTestId('task-title-input');
    await fireEvent.changeText(input, 'Write report');

    await waitFor(() => {
      expect(screen.getByTestId('task-title-input').props['value']).toBe('Write report');
    });
    expect(screen.getByTestId('save-task-button').props['accessibilityState']).toEqual({
      disabled: false,
    });

    await fireEvent.press(screen.getByTestId('save-task-button'));

    await waitFor(() => {
      expect(store.createCalls).toHaveLength(1);
    });
    expect(store.createCalls[0]?.draft.title).toBe('Write report');
    expect(store.tasks).toHaveLength(1);
    expect(store.tasks[0]?.status).toBe('todo');
  });

  it('announces validation errors and keeps the task unsaved', async () => {
    const user = userEvent.setup();
    const store = createInMemoryTaskStore();

    await renderEditor(store);
    await fireEvent.changeText(await screen.findByTestId('task-title-input'), 'Write report');

    await user.press(screen.getByText('10 min before'));
    await user.press(screen.getByTestId('save-task-button'));

    const alert = await screen.findByRole('alert');
    expect(alert.props['accessibilityLiveRegion']).toBe('assertive');
    expect(screen.getByText('A reminder before the due time needs a due date.')).toBeTruthy();
    expect(store.createCalls).toHaveLength(0);
  });
});
