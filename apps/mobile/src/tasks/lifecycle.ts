import { AppError } from '@/core/errors/AppError';

import { resolveAllDay, resolveLocalDateTime } from '@/recurrence/time';

import {
  TASK_PRIORITIES,
  type CompletedHistoryRecord,
  type DeletedTombstone,
  type Subtask,
  type Task,
  type TaskCrudContext,
  type TaskDraft,
  type TaskPatch,
  type TaskPriority,
  type TaskStatus,
} from './types';
import { TASK_STATUSES } from './types';

const MAX_TITLE_LENGTH = 500;
const MAX_NOTES_LENGTH = 10_000;
const MAX_SUBTASK_TITLE = 300;
const TOMBSTONE_RETENTION_MS = 24 * 60 * 60 * 1_000;

function validationError(message: string, code = 'task_validation_failed'): never {
  throw new AppError({ code, category: 'validation', message });
}

function normalizeTitle(title: string): string {
  const normalized = title.trim().replace(/\s+/g, ' ');
  if (normalized.length === 0) {
    validationError('A task title is required', 'task_title_required');
  }
  if (normalized.length > MAX_TITLE_LENGTH) {
    validationError(
      `Task titles cannot exceed ${String(MAX_TITLE_LENGTH)} characters`,
      'task_title_too_long',
    );
  }
  return normalized;
}

function normalizeNotes(notes: string | undefined): string {
  const normalized = notes?.trim() ?? '';
  if (normalized.length > MAX_NOTES_LENGTH) {
    validationError(
      `Task notes cannot exceed ${String(MAX_NOTES_LENGTH)} characters`,
      'task_notes_too_long',
    );
  }
  return normalized;
}

function normalizePriority(priority: TaskPriority | undefined): TaskPriority {
  const value = priority ?? 'none';
  if (!TASK_PRIORITIES.includes(value)) {
    validationError(`Unsupported task priority: ${String(value)}`, 'task_priority_invalid');
  }
  return value;
}

function normalizeStatus(status: TaskStatus | undefined): TaskStatus {
  const value = status ?? 'todo';
  if (!TASK_STATUSES.includes(value)) {
    validationError(`Unsupported task status: ${String(value)}`, 'task_status_invalid');
  }
  return value;
}

function normalizeDue(
  dueDate: string | null | undefined,
  dueTime: string | null | undefined,
): { dueDate: string | null; dueTime: string | null; isAllDay: boolean } {
  const date = dueDate ?? null;
  const time = dueTime ?? null;
  if (date === null) {
    if (time !== null) {
      validationError('A due time requires a due date', 'task_due_time_without_date');
    }
    return { dueDate: null, dueTime: null, isAllDay: true };
  }
  try {
    resolveAllDay(date, 'UTC');
  } catch {
    validationError(`Invalid task due date: ${date}`, 'task_due_date_invalid');
  }
  if (time !== null) {
    try {
      resolveLocalDateTime(date, time, 'UTC');
    } catch {
      validationError(`Invalid task due time: ${time}`, 'task_due_time_invalid');
    }
  }
  return { dueDate: date, dueTime: time, isAllDay: time === null };
}

export function deriveDueAt(
  dueDate: string | null,
  dueTime: string | null,
  timeZone: string,
): number | null {
  if (dueDate === null) return null;
  const resolved =
    dueTime === null
      ? resolveAllDay(dueDate, timeZone)
      : resolveLocalDateTime(dueDate, dueTime, timeZone);
  return resolved.millis;
}

export function validateTaskDraft(draft: TaskDraft): {
  readonly title: string;
  readonly notes: string;
  readonly listId: string | null;
  readonly priority: TaskPriority;
  readonly status: TaskStatus;
  readonly dueDate: string | null;
  readonly dueTime: string | null;
  readonly isAllDay: boolean;
} {
  const due = normalizeDue(draft.dueDate, draft.dueTime);
  const listId = draft.listId?.trim();
  return {
    title: normalizeTitle(draft.title),
    notes: normalizeNotes(draft.notes),
    listId: listId === undefined || listId.length === 0 ? null : listId,
    priority: normalizePriority(draft.priority),
    status: normalizeStatus(draft.status),
    ...due,
  };
}

export function createTask(draft: TaskDraft, context: TaskCrudContext): Task {
  const normalized = validateTaskDraft(draft);
  return {
    id: context.id,
    listId: normalized.listId ?? context.defaultListId,
    seriesId: null,
    title: normalized.title,
    notes: normalized.notes,
    status: normalized.status,
    priority: normalized.priority,
    dueDate: normalized.dueDate,
    dueTime: normalized.dueTime,
    dueAt: deriveDueAt(normalized.dueDate, normalized.dueTime, context.timeZone),
    isAllDay: normalized.isAllDay,
    occurrenceDate: null,
    isRecurrenceTemplate: false,
    sortOrder: 0,
    completedAt: null,
    archivedAt: null,
    deletedAt: null,
    createdAt: context.now,
    updatedAt: context.now,
  };
}

export function editTask(task: Task, patch: TaskPatch, now: number, timeZone: string): Task {
  if (patch.title !== undefined) {
    // Validate via a throwaway draft so the message and trimming match creation.
    normalizeTitle(patch.title);
  }
  if (patch.notes !== undefined) normalizeNotes(patch.notes);
  if (patch.priority !== undefined) normalizePriority(patch.priority);
  if (patch.status !== undefined) normalizeStatus(patch.status);

  const due =
    patch.dueDate !== undefined || patch.dueTime !== undefined
      ? normalizeDue(
          patch.dueDate === undefined ? task.dueDate : patch.dueDate,
          patch.dueTime === undefined ? task.dueTime : patch.dueTime,
        )
      : { dueDate: task.dueDate, dueTime: task.dueTime, isAllDay: task.isAllDay };

  return {
    ...task,
    title: patch.title === undefined ? task.title : normalizeTitle(patch.title),
    notes: patch.notes === undefined ? task.notes : normalizeNotes(patch.notes),
    listId: patch.listId === undefined ? task.listId : patch.listId,
    priority: patch.priority === undefined ? task.priority : patch.priority,
    status: patch.status === undefined ? task.status : patch.status,
    dueDate: due.dueDate,
    dueTime: due.dueTime,
    isAllDay: due.isAllDay,
    dueAt: deriveDueAt(due.dueDate, due.dueTime, timeZone),
    updatedAt: now,
  };
}

export function recomputeTaskForTimeZone(task: Task, timeZone: string, now: number): Task {
  const dueAt = deriveDueAt(task.dueDate, task.dueTime, timeZone);
  if (dueAt === task.dueAt) return task;
  return { ...task, dueAt, updatedAt: now };
}

export interface CompleteTaskOptions {
  readonly historyId: string;
  readonly undoToken: string;
  readonly occurrenceId?: string | null;
}

export interface CompleteTaskResult {
  readonly task: Task;
  readonly history: CompletedHistoryRecord | null;
}

export function completeTask(
  task: Task,
  now: number,
  options: CompleteTaskOptions,
): CompleteTaskResult {
  if (task.status === 'done') {
    return { task, history: null };
  }
  const completed: Task = {
    ...task,
    status: 'done',
    completedAt: now,
    updatedAt: now,
  };
  return {
    task: completed,
    history: {
      id: options.historyId,
      taskId: task.id,
      taskTitle: task.title,
      occurrenceId: options.occurrenceId ?? null,
      completedAt: now,
      previousStatus: task.status,
      previousCompletedAt: task.completedAt,
      undoToken: options.undoToken,
      undoneAt: null,
      createdAt: now,
    },
  };
}

export function undoComplete(task: Task, history: CompletedHistoryRecord, now: number): Task {
  if (history.taskId !== task.id) {
    validationError('Completion history does not belong to this task', 'task_history_mismatch');
  }
  return {
    ...task,
    status: history.previousStatus,
    completedAt: history.previousCompletedAt,
    updatedAt: now,
  };
}

export function archiveTask(task: Task, now: number): Task {
  return { ...task, archivedAt: now, updatedAt: now };
}

export function restoreArchivedTask(task: Task, now: number): Task {
  return { ...task, archivedAt: null, updatedAt: now };
}

export interface SoftDeleteResult {
  readonly task: Task;
  readonly tombstone: DeletedTombstone;
}

export function softDeleteTask(task: Task, now: number, tombstoneId: string): SoftDeleteResult {
  return {
    task: { ...task, deletedAt: now, updatedAt: now },
    tombstone: {
      id: tombstoneId,
      entityType: 'task',
      entityId: task.id,
      payload: JSON.stringify(task),
      deletedAt: now,
      undoExpiresAt: now + TOMBSTONE_RETENTION_MS,
      undoneAt: null,
    },
  };
}

export function restoreDeletedTask(task: Task, now: number): Task {
  return { ...task, deletedAt: null, updatedAt: now };
}

export function duplicateTask(task: Task, newId: string, now: number): Task {
  return {
    ...task,
    id: newId,
    title: `${task.title} (copy)`,
    status: task.status === 'done' ? 'todo' : task.status,
    completedAt: null,
    archivedAt: null,
    deletedAt: null,
    seriesId: null,
    occurrenceDate: null,
    isRecurrenceTemplate: false,
    createdAt: now,
    updatedAt: now,
  };
}

export function moveTaskToList(task: Task, listId: string, now: number): Task {
  const normalized = listId.trim();
  if (normalized.length === 0) {
    validationError('A destination list is required', 'task_list_required');
  }
  return { ...task, listId: normalized, updatedAt: now };
}

export function changeTaskPriority(task: Task, priority: TaskPriority, now: number): Task {
  return { ...task, priority: normalizePriority(priority), updatedAt: now };
}

export function createSubtask(
  taskId: string,
  title: string,
  id: string,
  now: number,
  sortOrder = 0,
): Subtask {
  const normalized = title.trim();
  if (normalized.length === 0) {
    validationError('A subtask title is required', 'subtask_title_required');
  }
  if (normalized.length > MAX_SUBTASK_TITLE) {
    validationError('Subtask titles are too long', 'subtask_title_too_long');
  }
  return {
    id,
    taskId,
    title: normalized,
    isCompleted: false,
    sortOrder,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function editSubtask(subtask: Subtask, title: string, now: number): Subtask {
  const normalized = title.trim();
  if (normalized.length === 0) {
    validationError('A subtask title is required', 'subtask_title_required');
  }
  if (normalized.length > MAX_SUBTASK_TITLE) {
    validationError('Subtask titles are too long', 'subtask_title_too_long');
  }
  return { ...subtask, title: normalized, updatedAt: now };
}

export function toggleSubtask(subtask: Subtask, now: number): Subtask {
  return { ...subtask, isCompleted: !subtask.isCompleted, updatedAt: now };
}

export function softDeleteSubtask(subtask: Subtask, now: number): Subtask {
  return { ...subtask, deletedAt: now, updatedAt: now };
}
