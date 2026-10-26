import { deviceTimeZone } from '@/db/m5';
import { reconcileNotifications } from '@/notifications/service';
import type { NotificationSettings } from '@/notifications/types';

import type { TaskFilter } from './repository';
import {
  addSubtaskToTask,
  archiveTaskById,
  clearRemindersForTask,
  completeTaskById,
  createTaskWithDetails,
  createListByName,
  currentContext,
  deleteSubtaskById,
  deleteTaskById,
  duplicateTaskById,
  loadTaskSnapshot,
  loadTaskDetail,
  loadNotificationSettings,
  removeRecurrenceForTask,
  restoreTaskById,
  saveRecurrenceForTask,
  saveReminderForTask,
  saveNotificationSettings,
  skipOccurrenceByTaskId,
  toggleSubtaskById,
  undoCompleteByToken,
  undoDeleteByToken,
  updateTaskById,
  type CompleteHandle,
  type CreateTaskInput,
  type DeleteHandle,
  type EditScope,
  type RecurrenceInput,
  type ReminderInput,
} from './service';
import type { TaskStore } from './store';
import type { Subtask, Task, TaskDetail, TaskList, TaskPatch, TaskSnapshot } from './types';

export function createSqliteTaskStore(): TaskStore {
  const listeners = new Set<() => void>();
  const context = () => currentContext(deviceTimeZone());

  const notify = (): void => {
    for (const listener of listeners) {
      try {
        listener();
      } catch {
        // A broken subscriber must not block persistence or other subscribers.
      }
    }
  };

  const syncQuietly = (reason: string): void => {
    void reconcileNotifications(reason).catch(() => undefined);
  };

  const afterMutation = (reason: string): void => {
    notify();
    syncQuietly(reason);
  };

  return {
    async loadTasks(filter: TaskFilter): Promise<TaskSnapshot> {
      return loadTaskSnapshot({ filter, timeZone: deviceTimeZone() });
    },

    async loadTask(id: string): Promise<TaskDetail | null> {
      return loadTaskDetail({ id, timeZone: deviceTimeZone() });
    },

    async loadSettings(): Promise<NotificationSettings> {
      return loadNotificationSettings();
    },

    async createTask(input: CreateTaskInput): Promise<Task> {
      const task = await createTaskWithDetails(input, context());
      afterMutation('task-created');
      return task;
    },

    async updateTask(id: string, patch: TaskPatch, scope: EditScope): Promise<Task> {
      const task = await updateTaskById(id, patch, scope, context());
      afterMutation('task-updated');
      return task;
    },

    async completeTask(id: string): Promise<CompleteHandle> {
      const handle = await completeTaskById(id, context());
      afterMutation('task-completed');
      return handle;
    },

    async undoComplete(token: string): Promise<void> {
      await undoCompleteByToken(token, context());
      afterMutation('task-completion-undone');
    },

    async deleteTask(id: string): Promise<DeleteHandle> {
      const handle = await deleteTaskById(id, context());
      afterMutation('task-deleted');
      return handle;
    },

    async undoDelete(token: string): Promise<void> {
      await undoDeleteByToken(token, context());
      afterMutation('task-delete-undone');
    },

    async archiveTask(id: string): Promise<void> {
      await archiveTaskById(id, context());
      afterMutation('task-archived');
    },

    async restoreTask(id: string): Promise<void> {
      await restoreTaskById(id, context());
      afterMutation('task-restored');
    },

    async createList(name: string): Promise<TaskList> {
      const list = await createListByName(name, context());
      afterMutation('list-created');
      return list;
    },

    async duplicateTask(id: string): Promise<Task> {
      const copy = await duplicateTaskById(id, context());
      afterMutation('task-duplicated');
      return copy;
    },

    async addSubtask(taskId: string, title: string): Promise<Subtask> {
      const subtask = await addSubtaskToTask(taskId, title, context());
      afterMutation('subtask-added');
      return subtask;
    },

    async toggleSubtask(id: string): Promise<Subtask> {
      const subtask = await toggleSubtaskById(id, context());
      afterMutation('subtask-toggled');
      return subtask;
    },

    async deleteSubtask(id: string): Promise<void> {
      await deleteSubtaskById(id, context());
      afterMutation('subtask-deleted');
    },

    async skipOccurrence(id: string): Promise<void> {
      await skipOccurrenceByTaskId(id, context());
      afterMutation('occurrence-skipped');
    },

    async saveReminder(taskId: string, input: ReminderInput | null): Promise<void> {
      const ctx = context();
      if (input === null) {
        await clearRemindersForTask(taskId, ctx);
      } else {
        await saveReminderForTask(taskId, input, ctx);
      }
      afterMutation('reminder-saved');
    },

    async saveRecurrence(taskId: string, input: RecurrenceInput | null): Promise<void> {
      if (input === null) {
        await removeRecurrenceForTask(taskId, context());
      } else {
        await saveRecurrenceForTask(taskId, input, context());
      }
      afterMutation('recurrence-saved');
    },

    async saveSettings(patch: Partial<NotificationSettings>): Promise<void> {
      await saveNotificationSettings(patch, context());
      afterMutation('settings-saved');
    },

    async sync(reason: string): Promise<void> {
      await reconcileNotifications(reason);
      notify();
    },

    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
