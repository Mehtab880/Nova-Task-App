import type { DbExecutor, SqliteValue } from '@/db/m5';
import { nullable, textValue } from '@/db/m5';

import { rowToHistory, rowToSubtask, rowToTask, rowToTaskList, rowToTombstone } from './mappers';
import type {
  CompletedHistoryRecord,
  DeletedTombstone,
  Subtask,
  Task,
  TaskList,
  TaskPriority,
} from './types';

export type TaskFilter = 'today' | 'inbox' | 'upcoming' | 'archived';

const TASK_COLUMNS = `id, list_id, series_id, title, notes, status, priority,
  due_date, due_time, due_at, is_all_day, occurrence_date, is_recurrence_template,
  sort_order, completed_at, archived_at, deleted_at, created_at, updated_at`;

function taskParams(task: Task): SqliteValue[] {
  return [
    task.id,
    task.listId,
    nullable(task.seriesId),
    task.title,
    task.notes,
    task.status,
    task.priority,
    nullable(task.dueDate),
    nullable(task.dueTime),
    nullable(task.dueAt),
    task.isAllDay ? 1 : 0,
    nullable(task.occurrenceDate),
    task.isRecurrenceTemplate ? 1 : 0,
    task.sortOrder,
    nullable(task.completedAt),
    nullable(task.archivedAt),
    nullable(task.deletedAt),
    task.createdAt,
    task.updatedAt,
  ];
}

export async function insertTask(db: DbExecutor, task: Task): Promise<void> {
  await db.execute(
    `INSERT INTO task (${TASK_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    taskParams(task),
  );
}

export async function updateTaskRow(db: DbExecutor, task: Task): Promise<void> {
  await db.execute(
    `UPDATE task SET
      list_id = ?, series_id = ?, title = ?, notes = ?, status = ?, priority = ?,
      due_date = ?, due_time = ?, due_at = ?, is_all_day = ?, occurrence_date = ?,
      is_recurrence_template = ?, sort_order = ?, completed_at = ?, archived_at = ?,
      deleted_at = ?, created_at = ?, updated_at = ?
     WHERE id = ?`,
    [
      task.listId,
      nullable(task.seriesId),
      task.title,
      task.notes,
      task.status,
      task.priority,
      nullable(task.dueDate),
      nullable(task.dueTime),
      nullable(task.dueAt),
      task.isAllDay ? 1 : 0,
      nullable(task.occurrenceDate),
      task.isRecurrenceTemplate ? 1 : 0,
      task.sortOrder,
      nullable(task.completedAt),
      nullable(task.archivedAt),
      nullable(task.deletedAt),
      task.createdAt,
      task.updatedAt,
      task.id,
    ],
  );
}

export async function findTask(db: DbExecutor, id: string): Promise<Task | null> {
  const result = await db.execute(`SELECT ${TASK_COLUMNS} FROM task WHERE id = ?`, [id]);
  const row = result.rows[0];
  return row === undefined ? null : rowToTask(row);
}

export async function listAllTasks(db: DbExecutor): Promise<Task[]> {
  const result = await db.execute(`SELECT ${TASK_COLUMNS} FROM task ORDER BY created_at ASC`);
  return result.rows.map(rowToTask);
}

export async function listVisibleTasks(
  db: DbExecutor,
  filter: TaskFilter,
  today: string,
): Promise<Task[]> {
  switch (filter) {
    case 'today': {
      const result = await db.execute(
        `SELECT ${TASK_COLUMNS} FROM task
         WHERE deleted_at IS NULL AND archived_at IS NULL
           AND is_recurrence_template = 0
           AND status IN ('todo', 'in_progress')
           AND due_date IS NOT NULL AND due_date <= ?
         ORDER BY due_date ASC, COALESCE(due_at, 0) ASC, created_at ASC`,
        [today],
      );
      return result.rows.map(rowToTask);
    }
    case 'upcoming': {
      const result = await db.execute(
        `SELECT ${TASK_COLUMNS} FROM task
         WHERE deleted_at IS NULL AND archived_at IS NULL
           AND is_recurrence_template = 0
           AND status IN ('todo', 'in_progress')
           AND due_date IS NOT NULL AND due_date > ?
         ORDER BY due_date ASC, COALESCE(due_at, 0) ASC, created_at ASC`,
        [today],
      );
      return result.rows.map(rowToTask);
    }
    case 'archived': {
      const result = await db.execute(
        `SELECT ${TASK_COLUMNS} FROM task
         WHERE deleted_at IS NULL AND archived_at IS NOT NULL AND is_recurrence_template = 0
         ORDER BY archived_at DESC`,
      );
      return result.rows.map(rowToTask);
    }
    case 'inbox':
    default: {
      const result = await db.execute(
        `SELECT ${TASK_COLUMNS} FROM task
         WHERE deleted_at IS NULL AND archived_at IS NULL
           AND is_recurrence_template = 0
           AND status IN ('todo', 'in_progress')
         ORDER BY (due_date IS NULL), due_date ASC, COALESCE(due_at, 0) ASC, created_at ASC`,
      );
      return result.rows.map(rowToTask);
    }
  }
}

export async function listSeriesTemplateTasks(db: DbExecutor): Promise<Task[]> {
  const result = await db.execute(
    `SELECT ${TASK_COLUMNS} FROM task
     WHERE deleted_at IS NULL AND is_recurrence_template = 1`,
  );
  return result.rows.map(rowToTask);
}

export async function countArchivedTasks(db: DbExecutor): Promise<number> {
  const result = await db.execute(
    `SELECT COUNT(*) AS count FROM task
     WHERE archived_at IS NOT NULL AND deleted_at IS NULL AND is_recurrence_template = 0`,
  );
  const value = result.rows[0]?.['count'];
  return typeof value === 'number' ? value : Number(value ?? 0);
}

export async function listLists(db: DbExecutor): Promise<TaskList[]> {
  const result = await db.execute(
    `SELECT id, name, color, is_default, sort_order, archived_at, created_at, updated_at
     FROM "list" WHERE archived_at IS NULL ORDER BY sort_order ASC, name ASC`,
  );
  return result.rows.map(rowToTaskList);
}

export async function insertList(db: DbExecutor, list: TaskList): Promise<void> {
  await db.execute(
    `INSERT INTO "list"
      (id, name, color, is_default, sort_order, archived_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      list.id,
      list.name,
      nullable(list.color),
      list.isDefault ? 1 : 0,
      list.sortOrder,
      nullable(list.archivedAt),
      list.createdAt,
      list.updatedAt,
    ],
  );
}

export async function insertSubtask(db: DbExecutor, subtask: Subtask): Promise<void> {
  await db.execute(
    `INSERT INTO subtask
      (id, task_id, title, is_completed, sort_order, deleted_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      subtask.id,
      subtask.taskId,
      subtask.title,
      subtask.isCompleted ? 1 : 0,
      subtask.sortOrder,
      nullable(subtask.deletedAt),
      subtask.createdAt,
      subtask.updatedAt,
    ],
  );
}

export async function updateSubtaskRow(db: DbExecutor, subtask: Subtask): Promise<void> {
  await db.execute(
    `UPDATE subtask SET title = ?, is_completed = ?, sort_order = ?, deleted_at = ?, updated_at = ?
     WHERE id = ?`,
    [
      subtask.title,
      subtask.isCompleted ? 1 : 0,
      subtask.sortOrder,
      nullable(subtask.deletedAt),
      subtask.updatedAt,
      subtask.id,
    ],
  );
}

export async function findSubtask(db: DbExecutor, id: string): Promise<Subtask | null> {
  const result = await db.execute(
    `SELECT id, task_id, title, is_completed, sort_order, deleted_at, created_at, updated_at
     FROM subtask WHERE id = ?`,
    [id],
  );
  const row = result.rows[0];
  return row === undefined ? null : rowToSubtask(row);
}

export async function listSubtasks(db: DbExecutor): Promise<Subtask[]> {
  const result = await db.execute(
    `SELECT id, task_id, title, is_completed, sort_order, deleted_at, created_at, updated_at
     FROM subtask WHERE deleted_at IS NULL ORDER BY task_id ASC, sort_order ASC, created_at ASC`,
  );
  return result.rows.map(rowToSubtask);
}

export async function insertHistory(
  db: DbExecutor,
  history: CompletedHistoryRecord,
): Promise<void> {
  await db.execute(
    `INSERT INTO completed_history
      (id, task_id, task_title, occurrence_id, completed_at, previous_status,
       previous_completed_at, undo_token, undone_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      history.id,
      history.taskId,
      history.taskTitle,
      nullable(history.occurrenceId),
      history.completedAt,
      history.previousStatus,
      nullable(history.previousCompletedAt),
      history.undoToken,
      nullable(history.undoneAt),
      history.createdAt,
    ],
  );
}

export async function findHistoryByToken(
  db: DbExecutor,
  undoToken: string,
): Promise<CompletedHistoryRecord | null> {
  const result = await db.execute(
    `SELECT id, task_id, task_title, occurrence_id, completed_at, previous_status,
            previous_completed_at, undo_token, undone_at, created_at
     FROM completed_history WHERE undo_token = ?`,
    [undoToken],
  );
  const row = result.rows[0];
  return row === undefined ? null : rowToHistory(row);
}

export async function findLatestHistory(
  db: DbExecutor,
  taskId: string,
): Promise<CompletedHistoryRecord | null> {
  const result = await db.execute(
    `SELECT id, task_id, task_title, occurrence_id, completed_at, previous_status,
            previous_completed_at, undo_token, undone_at, created_at
     FROM completed_history
     WHERE task_id = ? AND undone_at IS NULL
     ORDER BY completed_at DESC LIMIT 1`,
    [taskId],
  );
  const row = result.rows[0];
  return row === undefined ? null : rowToHistory(row);
}

export async function markHistoryUndone(db: DbExecutor, id: string, now: number): Promise<void> {
  await db.execute(`UPDATE completed_history SET undone_at = ? WHERE id = ?`, [now, id]);
}

export async function insertTombstone(db: DbExecutor, tombstone: DeletedTombstone): Promise<void> {
  await db.execute(
    `INSERT INTO deleted_tombstone
      (id, entity_type, entity_id, payload, deleted_at, undo_expires_at, undone_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      tombstone.id,
      tombstone.entityType,
      tombstone.entityId,
      tombstone.payload,
      tombstone.deletedAt,
      nullable(tombstone.undoExpiresAt),
      nullable(tombstone.undoneAt),
    ],
  );
}

export async function findActiveTombstone(
  db: DbExecutor,
  entityType: DeletedTombstone['entityType'],
  entityId: string,
): Promise<DeletedTombstone | null> {
  const result = await db.execute(
    `SELECT id, entity_type, entity_id, payload, deleted_at, undo_expires_at, undone_at
     FROM deleted_tombstone
     WHERE entity_type = ? AND entity_id = ? AND undone_at IS NULL
     ORDER BY deleted_at DESC LIMIT 1`,
    [entityType, entityId],
  );
  const row = result.rows[0];
  return row === undefined ? null : rowToTombstone(row);
}

export async function markTombstoneUndone(db: DbExecutor, id: string, now: number): Promise<void> {
  await db.execute(`UPDATE deleted_tombstone SET undone_at = ? WHERE id = ?`, [now, id]);
}

export async function deleteTaskRow(db: DbExecutor, id: string): Promise<void> {
  await db.execute('DELETE FROM task WHERE id = ?', [id]);
}

export async function setTaskPriority(
  db: DbExecutor,
  id: string,
  priority: TaskPriority,
  now: number,
): Promise<void> {
  await db.execute('UPDATE task SET priority = ?, updated_at = ? WHERE id = ?', [
    priority,
    now,
    id,
  ]);
}

export async function listTaskIdsForSeries(db: DbExecutor, seriesId: string): Promise<string[]> {
  const result = await db.execute(
    `SELECT id FROM task WHERE series_id = ? AND deleted_at IS NULL ORDER BY occurrence_date ASC`,
    [seriesId],
  );
  return result.rows.map(row => textValue(row, 'id'));
}

export async function updateTaskDueAt(
  db: DbExecutor,
  id: string,
  dueAt: number | null,
  now: number,
): Promise<void> {
  await db.execute('UPDATE task SET due_at = ?, updated_at = ? WHERE id = ?', [
    nullable(dueAt),
    now,
    id,
  ]);
}
