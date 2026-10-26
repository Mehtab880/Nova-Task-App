import { createContext, useContext } from 'react';

import type { NotificationSettings } from '@/notifications/types';

import type { TaskFilter } from './repository';
import type {
  CompleteHandle,
  CreateTaskInput,
  DeleteHandle,
  EditScope,
  RecurrenceInput,
  ReminderInput,
} from './service';
import type { Subtask, Task, TaskDetail, TaskPatch, TaskSnapshot } from './types';

/**
 * UI-facing contract. The SQLite implementation is production; component tests
 * inject an in-memory implementation so no native module is required.
 */
export interface TaskStore {
  loadTasks(filter: TaskFilter): Promise<TaskSnapshot>;
  loadTask(id: string): Promise<TaskDetail | null>;
  loadSettings(): Promise<NotificationSettings>;
  createTask(input: CreateTaskInput): Promise<Task>;
  updateTask(id: string, patch: TaskPatch, scope: EditScope): Promise<Task>;
  completeTask(id: string): Promise<CompleteHandle>;
  undoComplete(token: string): Promise<void>;
  deleteTask(id: string): Promise<DeleteHandle>;
  undoDelete(token: string): Promise<void>;
  archiveTask(id: string): Promise<void>;
  duplicateTask(id: string): Promise<Task>;
  addSubtask(taskId: string, title: string): Promise<Subtask>;
  toggleSubtask(id: string): Promise<Subtask>;
  deleteSubtask(id: string): Promise<void>;
  skipOccurrence(id: string): Promise<void>;
  saveReminder(taskId: string, input: ReminderInput | null): Promise<void>;
  saveRecurrence(taskId: string, input: RecurrenceInput | null): Promise<void>;
  saveSettings(patch: Partial<NotificationSettings>): Promise<void>;
  /** Rebuilds notification schedules from SQLite. */
  sync(reason: string): Promise<void>;
  /** Fires after every successful mutation so visible lists can refresh. */
  subscribe(listener: () => void): () => void;
}

export const TaskStoreContext = createContext<TaskStore | null>(null);

export function useTaskStore(): TaskStore {
  const store = useContext(TaskStoreContext);
  if (store === null) {
    throw new Error('useTaskStore must be used within TaskStoreProvider');
  }
  return store;
}
