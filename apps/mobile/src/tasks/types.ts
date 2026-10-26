export const TASK_STATUSES = ['todo', 'in_progress', 'done', 'cancelled'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ['none', 'low', 'medium', 'high', 'urgent'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export interface Task {
  readonly id: string;
  readonly listId: string;
  /** Template task id for a materialized recurrence occurrence. */
  readonly seriesId: string | null;
  readonly title: string;
  readonly notes: string;
  readonly status: TaskStatus;
  readonly priority: TaskPriority;
  /** Floating local date, `YYYY-MM-DD`. */
  readonly dueDate: string | null;
  /** Floating local time, `HH:mm`. Null means all-day. */
  readonly dueTime: string | null;
  /** Derived epoch millis for sorting; recomputed when the zone changes. */
  readonly dueAt: number | null;
  readonly isAllDay: boolean;
  readonly occurrenceDate: string | null;
  readonly isRecurrenceTemplate: boolean;
  readonly sortOrder: number;
  readonly completedAt: number | null;
  readonly archivedAt: number | null;
  readonly deletedAt: number | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface TaskList {
  readonly id: string;
  readonly name: string;
  readonly color: string | null;
  readonly isDefault: boolean;
  readonly sortOrder: number;
  readonly archivedAt: number | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface Subtask {
  readonly id: string;
  readonly taskId: string;
  readonly title: string;
  readonly isCompleted: boolean;
  readonly sortOrder: number;
  readonly deletedAt: number | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface TaskDraft {
  readonly title: string;
  readonly notes?: string;
  readonly listId?: string;
  readonly priority?: TaskPriority;
  readonly dueDate?: string | null;
  readonly dueTime?: string | null;
  readonly status?: TaskStatus;
}

export interface TaskPatch {
  readonly title?: string;
  readonly notes?: string;
  readonly listId?: string;
  readonly priority?: TaskPriority;
  readonly dueDate?: string | null;
  readonly dueTime?: string | null;
  readonly status?: TaskStatus;
}

export interface TaskCrudContext {
  readonly id: string;
  readonly now: number;
  readonly timeZone: string;
  readonly defaultListId: string;
}

export interface CompletedHistoryRecord {
  readonly id: string;
  readonly taskId: string;
  readonly taskTitle: string;
  readonly occurrenceId: string | null;
  readonly completedAt: number;
  readonly previousStatus: TaskStatus;
  readonly previousCompletedAt: number | null;
  readonly undoToken: string;
  readonly undoneAt: number | null;
  readonly createdAt: number;
}

export interface DeletedTombstone {
  readonly id: string;
  readonly entityType: 'task' | 'subtask' | 'reminder';
  readonly entityId: string;
  readonly payload: string;
  readonly deletedAt: number;
  readonly undoExpiresAt: number | null;
  readonly undoneAt: number | null;
}

export interface TaskWithDetails {
  readonly task: Task;
  readonly subtasks: readonly Subtask[];
}

export interface RecurrenceStatusSummary {
  readonly ruleId: string | null;
  readonly seriesId: string | null;
  readonly frequency: string | null;
  readonly nextDate: string | null;
  readonly nextTime: string | null;
  readonly occurrenceStatus: string | null;
  readonly completedCount: number;
}

export interface ReminderStatusSummary {
  readonly id: string;
  readonly taskId: string;
  readonly label: string;
  readonly kind: 'relative' | 'absolute';
  readonly offsetMinutes: number;
  readonly localDate: string | null;
  readonly localTime: string | null;
  readonly status: 'scheduled' | 'completed' | 'cancelled';
  readonly isExact: boolean;
  readonly nextTriggerAt: number | null;
  readonly scheduleState: string | null;
}

export interface TaskDetail {
  readonly task: Task;
  readonly subtasks: readonly Subtask[];
  readonly reminders: readonly ReminderStatusSummary[];
  readonly recurrence: RecurrenceStatusSummary | null;
  readonly listName: string | null;
  readonly today: string;
  /** Time zone the reminder timestamps should be rendered in. */
  readonly timezone: string;
}

export interface TaskSnapshot {
  readonly tasks: readonly TaskWithDetails[];
  readonly lists: readonly TaskList[];
  readonly archivedCount: number;
  readonly today: string;
  readonly reminders: readonly ReminderStatusSummary[];
  readonly recurrence: Readonly<Record<string, RecurrenceStatusSummary>>;
  readonly notificationState: {
    readonly permission: 'granted' | 'denied' | 'notDetermined';
    readonly exactAlarm: 'granted' | 'denied' | 'notApplicable';
    readonly scheduledCount: number;
    readonly deferredCount: number;
    readonly errorCount: number;
  };
  readonly revision: number;
}
