import { AppError } from '@/core/errors/AppError';
import {
  booleanValue,
  nullableNumber,
  nullableText,
  numberValue,
  textValue,
  type SqliteRow,
} from '@/db/m5';

import type {
  CompletedHistoryRecord,
  DeletedTombstone,
  Subtask,
  Task,
  TaskList,
  TaskPriority,
  TaskStatus,
} from './types';
import { TASK_PRIORITIES, TASK_STATUSES } from './types';

function taskStatus(value: string): TaskStatus {
  if (!TASK_STATUSES.includes(value as TaskStatus)) {
    throw new AppError({
      code: 'task_status_invalid_row',
      category: 'storage',
      message: `Unknown task status stored in SQLite: ${value}`,
    });
  }
  return value as TaskStatus;
}

function taskPriority(value: string): TaskPriority {
  if (!TASK_PRIORITIES.includes(value as TaskPriority)) {
    throw new AppError({
      code: 'task_priority_invalid_row',
      category: 'storage',
      message: `Unknown task priority stored in SQLite: ${value}`,
    });
  }
  return value as TaskPriority;
}

export function rowToTask(row: SqliteRow): Task {
  return {
    id: textValue(row, 'id'),
    listId: textValue(row, 'list_id'),
    seriesId: nullableText(row, 'series_id'),
    title: textValue(row, 'title'),
    notes: textValue(row, 'notes'),
    status: taskStatus(textValue(row, 'status')),
    priority: taskPriority(textValue(row, 'priority')),
    dueDate: nullableText(row, 'due_date'),
    dueTime: nullableText(row, 'due_time'),
    dueAt: nullableNumber(row, 'due_at'),
    isAllDay: booleanValue(row, 'is_all_day'),
    occurrenceDate: nullableText(row, 'occurrence_date'),
    isRecurrenceTemplate: booleanValue(row, 'is_recurrence_template'),
    sortOrder: numberValue(row, 'sort_order'),
    completedAt: nullableNumber(row, 'completed_at'),
    archivedAt: nullableNumber(row, 'archived_at'),
    deletedAt: nullableNumber(row, 'deleted_at'),
    createdAt: numberValue(row, 'created_at'),
    updatedAt: numberValue(row, 'updated_at'),
  };
}

export function rowToTaskList(row: SqliteRow): TaskList {
  return {
    id: textValue(row, 'id'),
    name: textValue(row, 'name'),
    color: nullableText(row, 'color'),
    isDefault: booleanValue(row, 'is_default'),
    sortOrder: numberValue(row, 'sort_order'),
    archivedAt: nullableNumber(row, 'archived_at'),
    createdAt: numberValue(row, 'created_at'),
    updatedAt: numberValue(row, 'updated_at'),
  };
}

export function rowToSubtask(row: SqliteRow): Subtask {
  return {
    id: textValue(row, 'id'),
    taskId: textValue(row, 'task_id'),
    title: textValue(row, 'title'),
    isCompleted: booleanValue(row, 'is_completed'),
    sortOrder: numberValue(row, 'sort_order'),
    deletedAt: nullableNumber(row, 'deleted_at'),
    createdAt: numberValue(row, 'created_at'),
    updatedAt: numberValue(row, 'updated_at'),
  };
}

export function rowToHistory(row: SqliteRow): CompletedHistoryRecord {
  return {
    id: textValue(row, 'id'),
    taskId: textValue(row, 'task_id'),
    taskTitle: textValue(row, 'task_title'),
    occurrenceId: nullableText(row, 'occurrence_id'),
    completedAt: numberValue(row, 'completed_at'),
    previousStatus: taskStatus(textValue(row, 'previous_status')),
    previousCompletedAt: nullableNumber(row, 'previous_completed_at'),
    undoToken: textValue(row, 'undo_token'),
    undoneAt: nullableNumber(row, 'undone_at'),
    createdAt: numberValue(row, 'created_at'),
  };
}

export function rowToTombstone(row: SqliteRow): DeletedTombstone {
  const entityType = textValue(row, 'entity_type');
  if (entityType !== 'task' && entityType !== 'subtask' && entityType !== 'reminder') {
    throw new AppError({
      code: 'tombstone_type_invalid',
      category: 'storage',
      message: `Unknown tombstone entity type: ${entityType}`,
    });
  }
  return {
    id: textValue(row, 'id'),
    entityType,
    entityId: textValue(row, 'entity_id'),
    payload: textValue(row, 'payload'),
    deletedAt: numberValue(row, 'deleted_at'),
    undoExpiresAt: nullableNumber(row, 'undo_expires_at'),
    undoneAt: nullableNumber(row, 'undone_at'),
  };
}
