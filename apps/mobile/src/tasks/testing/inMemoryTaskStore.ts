import { DEFAULT_NOTIFICATION_SETTINGS, type NotificationSettings } from '@/notifications/types';

import type { TaskFilter } from '../repository';
import type {
  CompleteHandle,
  CreateTaskInput,
  DeleteHandle,
  EditScope,
  RecurrenceInput,
  ReminderInput,
} from '../service';
import type { TaskStore } from '../store';
import type {
  ReminderStatusSummary,
  Subtask,
  Task,
  TaskDetail,
  TaskList,
  TaskPatch,
  TaskSnapshot,
  TaskWithDetails,
} from '../types';

export const IN_MEMORY_TODAY = '2026-10-26';
export const IN_MEMORY_LIST_ID = 'list_in_memory_default';

const DEFAULT_LISTS: readonly TaskList[] = [
  {
    id: IN_MEMORY_LIST_ID,
    name: 'Inbox',
    color: null,
    isDefault: true,
    sortOrder: 0,
    archivedAt: null,
    createdAt: 0,
    updatedAt: 0,
  },
];

export interface InMemoryTaskStore extends TaskStore {
  readonly tasks: readonly Task[];
  readonly subtasks: readonly Subtask[];
  readonly reminders: readonly ReminderStatusSummary[];
  readonly createCalls: readonly CreateTaskInput[];
  readonly completeCalls: readonly string[];
  readonly undoCompleteCalls: readonly string[];
  /** Replaces the seeded data without emitting a mutation. */
  seed(tasks: readonly Task[], subtasks?: readonly Subtask[]): void;
}

export interface InMemoryTaskStoreOptions {
  readonly today?: string;
}

function taskDueAt(task: Task): number | null {
  if (task.dueDate === null) return null;
  const epoch = Date.parse(`${task.dueDate}T${task.dueTime ?? '00:00'}:00`);
  return Number.isFinite(epoch) ? epoch : null;
}

function reminderFor(taskId: string, input: ReminderInput): ReminderStatusSummary {
  return {
    id: `reminder-${taskId}`,
    taskId,
    label: input.label ?? '',
    kind: input.kind,
    offsetMinutes: input.offsetMinutes ?? 0,
    localDate: input.localDate ?? null,
    localTime: input.localTime ?? null,
    status: 'scheduled',
    isExact: input.isExact ?? false,
    nextTriggerAt: null,
    scheduleState: 'pending',
  };
}

function isVisible(task: Task): boolean {
  return (
    task.deletedAt === null &&
    task.archivedAt === null &&
    !task.isRecurrenceTemplate &&
    (task.status === 'todo' || task.status === 'in_progress')
  );
}

/**
 * Test double for the SQLite-backed `TaskStore`. It keeps the same filtering
 * and undo semantics as the real repositories but never touches native code,
 * so component tests run on the Jest platform.
 */
export function createInMemoryTaskStore(options: InMemoryTaskStoreOptions = {}): InMemoryTaskStore {
  const today = options.today ?? IN_MEMORY_TODAY;
  let tasks: readonly Task[] = [];
  let subtasks: readonly Subtask[] = [];
  let reminders: readonly ReminderStatusSummary[] = [];
  let settings: NotificationSettings = {
    ...DEFAULT_NOTIFICATION_SETTINGS,
    timezone: 'UTC',
  };
  let revision = 0;
  let sequence = 0;
  let lists: readonly TaskList[] = DEFAULT_LISTS;
  const listeners = new Set<() => void>();
  const completedUndo = new Map<string, Task['status']>();
  const deletedUndo = new Set<string>();
  const createCalls: CreateTaskInput[] = [];
  const completeCalls: string[] = [];
  const undoCompleteCalls: string[] = [];

  const emit = (): void => {
    revision += 1;
    for (const listener of listeners) listener();
  };

  const filtered = (filter: TaskFilter): readonly Task[] => {
    if (filter === 'archived') {
      return tasks.filter(
        task => task.deletedAt === null && task.archivedAt !== null && !task.isRecurrenceTemplate,
      );
    }
    const visible = tasks.filter(isVisible);
    if (filter === 'today') {
      return visible.filter(task => task.dueDate !== null && task.dueDate <= today);
    }
    if (filter === 'upcoming') {
      return visible.filter(task => task.dueDate !== null && task.dueDate > today);
    }
    return visible;
  };

  const entriesFor = (list: readonly Task[]): readonly TaskWithDetails[] =>
    list.map(task => ({
      task,
      subtasks: subtasks.filter(
        subtask => subtask.taskId === task.id && subtask.deletedAt === null,
      ),
    }));

  const snapshot = (filter: TaskFilter): TaskSnapshot => ({
    tasks: entriesFor(filtered(filter)),
    lists,
    archivedCount: filtered('archived').length,
    today,
    reminders,
    recurrence: {},
    notificationState: {
      permission: 'granted',
      exactAlarm: 'granted',
      scheduledCount: reminders.length,
      deferredCount: 0,
      errorCount: 0,
    },
    revision,
  });

  const findTask = (id: string): Task | null => tasks.find(task => task.id === id) ?? null;

  const replaceTask = (next: Task): void => {
    tasks = tasks.map(task => (task.id === next.id ? next : task));
  };

  const detailFor = (task: Task): TaskDetail => ({
    task,
    subtasks: subtasks.filter(subtask => subtask.taskId === task.id && subtask.deletedAt === null),
    reminders: reminders.filter(reminder => reminder.taskId === task.id),
    recurrence: null,
    listName: lists.find(list => list.id === task.listId)?.name ?? null,
    today,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  });

  return {
    get tasks() {
      return tasks;
    },
    get subtasks() {
      return subtasks;
    },
    get reminders() {
      return reminders;
    },
    get createCalls() {
      return createCalls;
    },
    get completeCalls() {
      return completeCalls;
    },
    get undoCompleteCalls() {
      return undoCompleteCalls;
    },
    seed(nextTasks, nextSubtasks = []) {
      tasks = nextTasks;
      subtasks = nextSubtasks;
      sequence = nextTasks.length;
    },
    loadTasks(filter) {
      return Promise.resolve(snapshot(filter));
    },
    loadTask(id) {
      const task = findTask(id);
      return Promise.resolve(task === null ? null : detailFor(task));
    },
    loadSettings() {
      return Promise.resolve(settings);
    },
    createTask(input: CreateTaskInput) {
      createCalls.push(input);
      sequence += 1;
      const now = Date.now();
      const task: Task = {
        id: `task-${String(sequence)}`,
        listId: input.draft.listId ?? IN_MEMORY_LIST_ID,
        seriesId: null,
        title: input.draft.title,
        notes: input.draft.notes ?? '',
        status: input.draft.status ?? 'todo',
        priority: input.draft.priority ?? 'none',
        dueDate: input.draft.dueDate ?? null,
        dueTime: input.draft.dueTime ?? null,
        dueAt: null,
        isAllDay: (input.draft.dueTime ?? null) === null,
        occurrenceDate: null,
        isRecurrenceTemplate: false,
        sortOrder: sequence,
        completedAt: null,
        archivedAt: null,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      tasks = [...tasks, { ...task, dueAt: taskDueAt(task) }];
      if (input.reminder !== null && input.reminder !== undefined) {
        reminders = [...reminders, reminderFor(task.id, input.reminder)];
      }
      emit();
      return Promise.resolve(tasks[tasks.length - 1] ?? task);
    },
    updateTask(id: string, patch: TaskPatch, _scope: EditScope) {
      const existing = findTask(id);
      if (existing === null) return Promise.reject(new Error(`Task ${id} not found`));
      const next: Task = {
        ...existing,
        ...patch,
        updatedAt: Date.now(),
      };
      replaceTask({ ...next, dueAt: taskDueAt(next) });
      emit();
      return Promise.resolve(next);
    },
    completeTask(id: string): Promise<CompleteHandle> {
      completeCalls.push(id);
      const existing = findTask(id);
      if (existing === null) return Promise.reject(new Error(`Task ${id} not found`));
      const undoToken = `undo-complete-${id}`;
      completedUndo.set(undoToken, existing.status);
      const completedAt = Date.now();
      replaceTask({ ...existing, status: 'done', completedAt, updatedAt: completedAt });
      emit();
      return Promise.resolve({ taskId: id, undoToken, completedAt });
    },
    undoComplete(token: string) {
      undoCompleteCalls.push(token);
      const previous = completedUndo.get(token);
      const id = token.replace('undo-complete-', '');
      const existing = findTask(id);
      if (previous !== undefined && existing !== null) {
        replaceTask({
          ...existing,
          status: previous,
          completedAt: null,
          updatedAt: Date.now(),
        });
        completedUndo.delete(token);
        emit();
      }
      return Promise.resolve();
    },
    deleteTask(id: string): Promise<DeleteHandle> {
      const existing = findTask(id);
      if (existing === null) return Promise.reject(new Error(`Task ${id} not found`));
      const undoToken = `undo-delete-${id}`;
      deletedUndo.add(undoToken);
      const deletedAt = Date.now();
      replaceTask({ ...existing, deletedAt, updatedAt: deletedAt });
      emit();
      return Promise.resolve({ taskId: id, undoToken, deletedAt });
    },
    undoDelete(token: string) {
      const id = token.replace('undo-delete-', '');
      const existing = findTask(id);
      if (deletedUndo.has(token) && existing !== null) {
        replaceTask({ ...existing, deletedAt: null, updatedAt: Date.now() });
        deletedUndo.delete(token);
        emit();
      }
      return Promise.resolve();
    },
    archiveTask(id: string) {
      const existing = findTask(id);
      if (existing === null) return Promise.reject(new Error(`Task ${id} not found`));
      const archivedAt = Date.now();
      replaceTask({ ...existing, archivedAt, updatedAt: archivedAt });
      emit();
      return Promise.resolve();
    },
    restoreTask(id: string) {
      const existing = findTask(id);
      if (existing === null) return Promise.reject(new Error(`Task ${id} not found`));
      const restoredAt = Date.now();
      replaceTask({ ...existing, archivedAt: null, updatedAt: restoredAt });
      emit();
      return Promise.resolve();
    },
    createList(name: string) {
      const trimmed = name.trim();
      if (trimmed.length === 0) return Promise.reject(new Error('A list needs a name'));
      const clash = lists.some(list => list.name.trim().toLowerCase() === trimmed.toLowerCase());
      if (clash) return Promise.reject(new Error('A list with that name already exists'));
      sequence += 1;
      const now = Date.now();
      const list: TaskList = {
        id: `list-${String(sequence)}`,
        name: trimmed,
        color: null,
        isDefault: false,
        sortOrder: lists.length,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      lists = [...lists, list];
      emit();
      return Promise.resolve(list);
    },
    duplicateTask(id: string) {
      const existing = findTask(id);
      if (existing === null) return Promise.reject(new Error(`Task ${id} not found`));
      sequence += 1;
      const now = Date.now();
      const copy: Task = {
        ...existing,
        id: `task-${String(sequence)}`,
        title: existing.title,
        status: 'todo',
        completedAt: null,
        archivedAt: null,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      tasks = [...tasks, copy];
      emit();
      return Promise.resolve(copy);
    },
    addSubtask(taskId: string, title: string) {
      sequence += 1;
      const now = Date.now();
      const subtask: Subtask = {
        id: `subtask-${String(sequence)}`,
        taskId,
        title,
        isCompleted: false,
        sortOrder: sequence,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      subtasks = [...subtasks, subtask];
      emit();
      return Promise.resolve(subtask);
    },
    toggleSubtask(id: string) {
      const existing = subtasks.find(subtask => subtask.id === id);
      if (existing === undefined) return Promise.reject(new Error(`Subtask ${id} not found`));
      const next: Subtask = {
        ...existing,
        isCompleted: !existing.isCompleted,
        updatedAt: Date.now(),
      };
      subtasks = subtasks.map(subtask => (subtask.id === id ? next : subtask));
      emit();
      return Promise.resolve(next);
    },
    deleteSubtask(id: string) {
      const existing = subtasks.find(subtask => subtask.id === id);
      if (existing === undefined) return Promise.reject(new Error(`Subtask ${id} not found`));
      subtasks = subtasks.map(subtask =>
        subtask.id === id ? { ...subtask, deletedAt: Date.now() } : subtask,
      );
      emit();
      return Promise.resolve();
    },
    skipOccurrence() {
      return Promise.resolve();
    },
    saveReminder(taskId: string, input: ReminderInput | null) {
      reminders = reminders.filter(reminder => reminder.taskId !== taskId);
      if (input !== null) reminders = [...reminders, reminderFor(taskId, input)];
      emit();
      return Promise.resolve();
    },
    saveRecurrence(_taskId: string, _input: RecurrenceInput | null) {
      return Promise.resolve();
    },
    saveSettings(patch: Partial<NotificationSettings>) {
      settings = { ...settings, ...patch };
      emit();
      return Promise.resolve();
    },
    sync() {
      return Promise.resolve();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
