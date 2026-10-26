import { AppError } from '@/core/errors/AppError';
import { createEntityId } from '@/core/ids/ulid';
import type { DbExecutor } from '@/db/m5';
import { m5Read, m5Transaction, textValue } from '@/db/m5';
import { rowToOccurrence } from '@/recurrence/repository';
import {
  findRuleById,
  findRuleByTaskId,
  insertRule,
  listOccurrencesForRule,
  listRules,
  updateOccurrenceStatus,
  updateRuleRow,
} from '@/recurrence/repository';
import {
  dropPendingOccurrencesFrom,
  materializeNextAfterCompletion,
  materializeRule,
  ruleToPattern,
} from '@/recurrence/materialize';
import { normalizeRecurrencePattern } from '@/recurrence/engine';
import { isValidLocalDate, isValidLocalTime, localDateInZone } from '@/recurrence/time';
import type { RecurrencePattern, RecurrenceRule } from '@/recurrence/types';
import {
  deleteReminder,
  insertReminder,
  listReminders,
  listSchedules,
  readSettings,
  updateReminderRow,
} from '@/notifications/repository';
import type { NotificationSettings, ReminderDefinition } from '@/notifications/types';
import { systemClock } from '@/core/time/Clock';

import {
  archiveTask,
  changeTaskPriority,
  completeTask,
  createSubtask,
  createTask,
  deriveDueAt,
  duplicateTask,
  editTask,
  moveTaskToList,
  restoreArchivedTask,
  restoreDeletedTask,
  softDeleteSubtask,
  softDeleteTask,
  toggleSubtask,
  undoComplete,
} from './lifecycle';
import {
  countArchivedTasks,
  findActiveTombstone,
  findHistoryByToken,
  findSubtask,
  findTask,
  insertHistory,
  insertList,
  insertSubtask,
  insertTask,
  insertTombstone,
  listAllTasks,
  listLists,
  listSubtasks,
  listVisibleTasks,
  markHistoryUndone,
  markTombstoneUndone,
  updateSubtaskRow,
  updateTaskDueAt,
  updateTaskRow,
  type TaskFilter,
} from './repository';
import type {
  RecurrenceStatusSummary,
  ReminderStatusSummary,
  Subtask,
  Task,
  TaskDetail,
  TaskDraft,
  TaskList,
  TaskPatch,
  TaskSnapshot,
  TaskWithDetails,
} from './types';

const MAX_OFFSET_MINUTES = 60 * 24 * 366;

export interface ReminderInput {
  readonly label?: string;
  readonly kind: 'relative' | 'absolute';
  readonly offsetMinutes?: number;
  readonly localDate?: string | null;
  readonly localTime?: string | null;
  readonly isExact?: boolean;
}

export interface RecurrenceInput extends Omit<RecurrencePattern, 'timezone'> {
  readonly timezone?: string;
}

export interface CreateTaskInput {
  readonly draft: TaskDraft;
  readonly reminder?: ReminderInput | null;
  readonly recurrence?: RecurrenceInput | null;
}

export interface ServiceContext {
  readonly now: number;
  readonly timeZone: string;
}

export function currentContext(timeZone: string): ServiceContext {
  return { now: systemClock.now().getTime(), timeZone };
}

export interface CompleteHandle {
  readonly taskId: string;
  readonly undoToken: string;
  readonly completedAt: number;
}

export interface DeleteHandle {
  readonly taskId: string;
  readonly undoToken: string;
  readonly deletedAt: number;
}

function invalid(message: string, code: string): never {
  throw new AppError({ code, category: 'validation', message });
}

function normalizeReminderInput(
  input: ReminderInput,
): Omit<ReminderDefinition, 'id' | 'taskId' | 'createdAt' | 'updatedAt'> {
  const label = (input.label ?? '').trim();
  if (label.length > 120) {
    invalid('Reminder labels cannot exceed 120 characters', 'reminder_label_too_long');
  }
  if (input.kind === 'relative') {
    const offset = Math.trunc(input.offsetMinutes ?? 0);
    if (!Number.isFinite(offset) || Math.abs(offset) > MAX_OFFSET_MINUTES) {
      invalid('Reminder offset is out of range', 'reminder_offset_invalid');
    }
    return {
      label,
      kind: 'relative',
      offsetMinutes: offset,
      localDate: null,
      localTime: null,
      isExact: input.isExact ?? true,
      status: 'scheduled',
      snoozeUntil: null,
    };
  }

  if (input.localDate === null || input.localDate === undefined) {
    invalid('An absolute reminder needs a date', 'reminder_date_required');
  }
  if (!isValidLocalDate(input.localDate)) {
    invalid('Absolute reminder date is invalid', 'reminder_date_invalid');
  }
  if (input.localTime === null || input.localTime === undefined) {
    invalid('An absolute reminder needs a time', 'reminder_time_required');
  }
  if (!isValidLocalTime(input.localTime)) {
    invalid('Absolute reminder time is invalid', 'reminder_time_invalid');
  }
  return {
    label,
    kind: 'absolute',
    offsetMinutes: 0,
    localDate: input.localDate,
    localTime: input.localTime,
    isExact: input.isExact ?? true,
    status: 'scheduled',
    snoozeUntil: null,
  };
}

async function insertReminderDefinition(
  db: DbExecutor,
  taskId: string,
  input: ReminderInput,
  now: number,
): Promise<ReminderDefinition> {
  const normalized = normalizeReminderInput(input);
  const reminder: ReminderDefinition = {
    id: createEntityId('reminder'),
    taskId,
    ...normalized,
    createdAt: now,
    updatedAt: now,
  };
  await insertReminder(db, reminder);
  return reminder;
}

function assertRelativeReminderHasDue(reminder: ReminderDefinition, task: Task): void {
  if (reminder.kind === 'relative' && task.dueDate === null) {
    invalid('A relative reminder needs a task due date and time', 'reminder_requires_due_date');
  }
}

export async function createTaskWithDetails(
  input: CreateTaskInput,
  context: ServiceContext,
): Promise<Task> {
  return m5Transaction(async db => {
    const settings = await readSettings(db);
    const zone = input.recurrence?.timezone ?? context.timeZone ?? settings.timezone;
    const recurrence = input.recurrence ?? null;
    const created = createTask(
      {
        ...input.draft,
        ...(recurrence === null
          ? {}
          : { dueDate: recurrence.startDate, dueTime: recurrence.startTime }),
      },
      {
        id: createEntityId('task'),
        now: context.now,
        timeZone: zone,
        defaultListId: await defaultListId(db),
      },
    );

    const task: Task = recurrence === null ? created : { ...created, isRecurrenceTemplate: true };
    await db.execute(
      `INSERT INTO task (id, list_id, series_id, title, notes, status, priority,
        due_date, due_time, due_at, is_all_day, occurrence_date, is_recurrence_template,
        sort_order, completed_at, archived_at, deleted_at, created_at, updated_at)
       VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL, NULL, NULL, ?, ?)`,
      [
        task.id,
        task.listId,
        task.title,
        task.notes,
        task.status,
        task.priority,
        task.dueDate,
        task.dueTime,
        task.dueAt,
        task.isAllDay ? 1 : 0,
        task.isRecurrenceTemplate ? 1 : 0,
        task.sortOrder,
        task.createdAt,
        task.updatedAt,
      ],
    );

    if (recurrence !== null) {
      const pattern = normalizeRecurrencePattern({
        ...recurrence,
        timezone: zone,
      });
      const rule: RecurrenceRule = {
        ...pattern,
        id: createEntityId('rule'),
        taskId: task.id,
        completedCount: 0,
        isActive: true,
        createdAt: context.now,
        updatedAt: context.now,
      };
      await insertRule(db, rule);
      await materializeRule(db, rule, task, {
        now: context.now,
        today: localDateInZone(context.now, zone),
        horizonDays: settings.recurrenceHorizonDays,
        timeZone: zone,
      });
    }

    if (input.reminder !== undefined && input.reminder !== null) {
      const reminder = await insertReminderDefinition(db, task.id, input.reminder, context.now);
      assertRelativeReminderHasDue(reminder, task);
    }

    return task;
  });
}

async function defaultListId(db: DbExecutor): Promise<string> {
  const lists = await listLists(db);
  const preferred = lists.find(list => list.isDefault) ?? lists[0];
  if (preferred === undefined) {
    throw new AppError({
      code: 'default_list_missing',
      category: 'storage',
      message: 'The default task list is missing',
    });
  }
  return preferred.id;
}

export type EditScope = 'one' | 'series' | 'following';

export async function updateTaskById(
  id: string,
  patch: TaskPatch,
  scope: EditScope,
  context: ServiceContext,
): Promise<Task> {
  return m5Transaction(async db => {
    const task = await findTask(db, id);
    if (task === null) {
      throw new AppError({
        code: 'task_not_found',
        category: 'storage',
        message: 'Task not found',
      });
    }

    const occurrence = await findOccurrenceByTaskIdRow(db, task.id);
    if (occurrence !== null && task.seriesId !== null) {
      if (scope === 'one') {
        return editOccurrenceOnly(db, task, occurrence, patch, context);
      }
      if (scope === 'series') {
        return editSeries(db, task, occurrence, patch, context);
      }
      return editFollowing(db, task, occurrence, patch, context);
    }

    if (task.isRecurrenceTemplate) {
      return editTemplateTask(db, task, patch, context);
    }

    const updated = editTask(task, patch, context.now, context.timeZone);
    await updateTaskRow(db, updated);
    return updated;
  });
}

async function findOccurrenceByTaskIdRow(
  db: DbExecutor,
  taskId: string,
): Promise<ReturnType<typeof rowToOccurrence> | null> {
  const result = await db.execute(
    `SELECT id, rule_id, task_id, occurrence_date, occurrence_time, status,
            is_exception, scheduled_at, completed_at, created_at, updated_at
     FROM recurrence_occurrence WHERE task_id = ?`,
    [taskId],
  );
  const row = result.rows[0];
  return row === undefined ? null : rowToOccurrence(row);
}

async function editOccurrenceOnly(
  db: DbExecutor,
  task: Task,
  occurrence: NonNullable<Awaited<ReturnType<typeof findOccurrenceByTaskIdRow>>>,
  patch: TaskPatch,
  context: ServiceContext,
): Promise<Task> {
  const updated = editTask(task, patch, context.now, context.timeZone);
  await updateTaskRow(db, updated);
  if (updated.dueDate !== null && updated.dueDate !== occurrence.occurrenceDate) {
    const conflict = await db.execute(
      `SELECT id FROM recurrence_occurrence
       WHERE rule_id = ? AND occurrence_date = ? AND id <> ?`,
      [occurrence.ruleId, updated.dueDate, occurrence.id],
    );
    if (conflict.rows.length > 0) {
      invalid('That date already has an occurrence in this series', 'occurrence_date_conflict');
    }
    await db.execute(
      `UPDATE recurrence_occurrence SET occurrence_date = ?, occurrence_time = ?,
        is_exception = 1, updated_at = ? WHERE id = ?`,
      [updated.dueDate, updated.dueTime, context.now, occurrence.id],
    );
  } else {
    await db.execute(
      'UPDATE recurrence_occurrence SET is_exception = 1, occurrence_time = ?, updated_at = ? WHERE id = ?',
      [updated.dueTime, context.now, occurrence.id],
    );
  }
  return updated;
}

async function editSeries(
  db: DbExecutor,
  occurrenceTask: Task,
  occurrence: NonNullable<Awaited<ReturnType<typeof findOccurrenceByTaskIdRow>>>,
  patch: TaskPatch,
  context: ServiceContext,
): Promise<Task> {
  const template = await findTask(db, occurrenceTask.seriesId ?? '');
  if (template === null) {
    invalid('The recurring series template is missing', 'series_template_missing');
  }
  const rule = await findRuleById(db, occurrence.ruleId);
  if (rule === null) {
    invalid('The recurring series rule is missing', 'series_rule_missing');
  }

  const updatedTemplate = editTask(template, patch, context.now, rule.timezone);
  await updateTaskRow(db, updatedTemplate);

  const pending = await db.execute(
    `SELECT id FROM task WHERE series_id = ? AND id <> ? AND deleted_at IS NULL
       AND status IN ('todo', 'in_progress')`,
    [template.id, occurrenceTask.id],
  );
  for (const row of pending.rows) {
    const taskId = textValue(row, 'id');
    await db.execute(
      `UPDATE task SET title = ?, notes = ?, priority = ?, list_id = ?, updated_at = ?
       WHERE id = ?`,
      [
        updatedTemplate.title,
        updatedTemplate.notes,
        updatedTemplate.priority,
        updatedTemplate.listId,
        context.now,
        taskId,
      ],
    );
  }

  // The task the user was editing follows the new series values too.
  const updatedOccurrenceTask = editTask(
    occurrenceTask,
    {
      title: updatedTemplate.title,
      notes: updatedTemplate.notes,
      priority: updatedTemplate.priority,
      listId: updatedTemplate.listId,
    },
    context.now,
    rule.timezone,
  );
  await updateTaskRow(db, updatedOccurrenceTask);

  const nextRule: RecurrenceRule =
    patch.dueDate !== undefined || patch.dueTime !== undefined
      ? {
          ...rule,
          startDate: updatedTemplate.dueDate ?? rule.startDate,
          startTime: updatedTemplate.dueTime,
          updatedAt: context.now,
        }
      : { ...rule, updatedAt: context.now };
  await updateRuleRow(db, nextRule);

  if (patch.dueDate !== undefined || patch.dueTime !== undefined) {
    await dropPendingOccurrencesFrom(db, rule.id, addOneDay(occurrence.occurrenceDate));
    const settings = await readSettings(db);
    await materializeRule(db, nextRule, updatedTemplate, {
      now: context.now,
      today: localDateInZone(context.now, rule.timezone),
      horizonDays: settings.recurrenceHorizonDays,
      timeZone: rule.timezone,
    });
  }

  return updatedOccurrenceTask;
}

function addOneDay(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const value = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, (day ?? 1) + 1));
  return value.toISOString().slice(0, 10);
}

async function editFollowing(
  db: DbExecutor,
  occurrenceTask: Task,
  occurrence: NonNullable<Awaited<ReturnType<typeof findOccurrenceByTaskIdRow>>>,
  patch: TaskPatch,
  context: ServiceContext,
): Promise<Task> {
  const template = await findTask(db, occurrenceTask.seriesId ?? '');
  const oldRule = await findRuleById(db, occurrence.ruleId);
  if (template === null || oldRule === null) {
    invalid('The recurring series is missing', 'series_template_missing');
  }

  const settings = await readSettings(db);
  const newStartDate = occurrence.occurrenceDate;
  const newStartTime = patch.dueTime === undefined ? occurrenceTask.dueTime : patch.dueTime;
  const edited = editTask(
    { ...occurrenceTask, dueDate: newStartDate, dueTime: newStartTime },
    { ...patch, dueDate: newStartDate, dueTime: newStartTime },
    context.now,
    oldRule.timezone,
  );

  await dropPendingOccurrencesFrom(db, oldRule.id, newStartDate);
  await db.execute(
    'UPDATE recurrence_rule SET is_active = 0, end_date = ?, updated_at = ? WHERE id = ?',
    [occurrence.occurrenceDate, context.now, oldRule.id],
  );

  const newTemplate: Task = {
    ...template,
    id: createEntityId('task'),
    title: edited.title,
    notes: edited.notes,
    priority: edited.priority,
    listId: edited.listId,
    dueDate: newStartDate,
    dueTime: newStartTime,
    dueAt: deriveDueAt(newStartDate, newStartTime, oldRule.timezone),
    isAllDay: newStartTime === null,
    isRecurrenceTemplate: true,
    seriesId: null,
    occurrenceDate: null,
    status: 'todo',
    completedAt: null,
    archivedAt: null,
    deletedAt: null,
    createdAt: context.now,
    updatedAt: context.now,
  };
  await db.execute(
    `INSERT INTO task (id, list_id, series_id, title, notes, status, priority,
      due_date, due_time, due_at, is_all_day, occurrence_date, is_recurrence_template,
      sort_order, completed_at, archived_at, deleted_at, created_at, updated_at)
     VALUES (?, ?, NULL, ?, ?, 'todo', ?, ?, ?, ?, ?, NULL, 1, ?, NULL, NULL, NULL, ?, ?)`,
    [
      newTemplate.id,
      newTemplate.listId,
      newTemplate.title,
      newTemplate.notes,
      newTemplate.priority,
      newTemplate.dueDate,
      newTemplate.dueTime,
      newTemplate.dueAt,
      newTemplate.isAllDay ? 1 : 0,
      newTemplate.sortOrder,
      context.now,
      context.now,
    ],
  );

  const newRule: RecurrenceRule = {
    ...ruleToPattern(oldRule),
    ...(patch.dueDate === undefined ? {} : { startDate: newStartDate }),
    startDate: newStartDate,
    startTime: newStartTime,
    endDate: oldRule.endDate,
    endAfterCount: oldRule.endAfterCount,
    completedCount: 0,
    repeatAfterCompletion: oldRule.repeatAfterCompletion,
    id: createEntityId('rule'),
    taskId: newTemplate.id,
    isActive: true,
    createdAt: context.now,
    updatedAt: context.now,
  };
  await insertRule(db, newRule);

  const reminders = await listRemindersForTaskId(db, template.id);
  for (const reminder of reminders) {
    await insertReminder(db, {
      ...reminder,
      id: createEntityId('reminder'),
      taskId: newTemplate.id,
      status: 'scheduled',
      snoozeUntil: null,
      createdAt: context.now,
      updatedAt: context.now,
    });
  }
  await db.execute(
    `UPDATE reminder SET status = 'cancelled', updated_at = ? WHERE task_id = ? AND status = 'scheduled'`,
    [context.now, template.id],
  );

  await materializeRule(db, newRule, newTemplate, {
    now: context.now,
    today: newStartDate,
    horizonDays: settings.recurrenceHorizonDays,
    timeZone: oldRule.timezone,
  });

  return newTemplate;
}

async function listRemindersForTaskId(
  db: DbExecutor,
  taskId: string,
): Promise<ReminderDefinition[]> {
  const all = await listReminders(db);
  return all.filter(reminder => reminder.taskId === taskId);
}

async function editTemplateTask(
  db: DbExecutor,
  template: Task,
  patch: TaskPatch,
  context: ServiceContext,
): Promise<Task> {
  const rule = await findRuleByTaskId(db, template.id);
  const zone = rule?.timezone ?? context.timeZone;
  const updated = editTask(template, patch, context.now, zone);
  await updateTaskRow(db, updated);

  if (rule !== null) {
    const nextRule: RecurrenceRule = {
      ...rule,
      startDate: updated.dueDate ?? rule.startDate,
      startTime: updated.dueTime,
      updatedAt: context.now,
    };
    await updateRuleRow(db, nextRule);
    if (patch.dueDate !== undefined || patch.dueTime !== undefined) {
      await dropPendingOccurrencesFrom(db, rule.id, localDateInZone(context.now, zone));
      const settings = await readSettings(db);
      await materializeRule(db, nextRule, updated, {
        now: context.now,
        today: localDateInZone(context.now, zone),
        horizonDays: settings.recurrenceHorizonDays,
        timeZone: zone,
      });
    }
  }
  return updated;
}

export async function completeTaskById(
  id: string,
  context: ServiceContext,
): Promise<CompleteHandle> {
  return m5Transaction(async db => completeTaskInDb(db, id, context));
}

/**
 * Completion primitive that can run inside an existing transaction, including
 * one owned by the native action drain.
 */
export async function completeTaskInDb(
  db: DbExecutor,
  id: string,
  context: ServiceContext,
): Promise<CompleteHandle> {
  const task = await findTask(db, id);
  if (task === null) {
    throw new AppError({
      code: 'task_not_found',
      category: 'storage',
      message: 'Task not found',
    });
  }
  const occurrence = await findOccurrenceByTaskIdRow(db, task.id);
  const result = completeTask(task, context.now, {
    historyId: createEntityId('history'),
    undoToken: createEntityId('undo'),
    occurrenceId: occurrence?.id ?? null,
  });
  if (result.history === null) {
    return { taskId: task.id, undoToken: '', completedAt: context.now };
  }
  await updateTaskRow(db, result.task);
  await insertHistory(db, result.history);

  if (occurrence !== null) {
    await updateOccurrenceStatus(db, occurrence.id, 'completed', context.now, context.now);
    const rule = await findRuleById(db, occurrence.ruleId);
    const template = task.seriesId === null ? null : await findTask(db, task.seriesId);
    if (rule !== null) {
      const nextRule: RecurrenceRule = {
        ...rule,
        completedCount: rule.completedCount + 1,
        updatedAt: context.now,
      };
      await updateRuleRow(db, nextRule);
      if (template !== null && rule.repeatAfterCompletion) {
        await materializeNextAfterCompletion(
          db,
          nextRule,
          template,
          occurrence.occurrenceDate,
          nextRule.completedCount,
          context.now,
          rule.timezone,
        );
      } else if (template !== null) {
        const settings = await readSettings(db);
        await materializeRule(db, nextRule, template, {
          now: context.now,
          today: localDateInZone(context.now, rule.timezone),
          horizonDays: settings.recurrenceHorizonDays,
          timeZone: rule.timezone,
        });
      }
    }
  }

  return {
    taskId: task.id,
    undoToken: result.history.undoToken,
    completedAt: context.now,
  };
}

export async function undoCompleteByToken(
  undoToken: string,
  context: ServiceContext,
): Promise<Task> {
  return m5Transaction(async db => {
    const history = await findHistoryByToken(db, undoToken);
    if (history === null || history.undoneAt !== null) {
      throw new AppError({
        code: 'undo_expired',
        category: 'validation',
        message: 'That undo is no longer available',
      });
    }
    const task = await findTask(db, history.taskId);
    if (task === null) {
      throw new AppError({
        code: 'task_not_found',
        category: 'storage',
        message: 'Task not found',
      });
    }
    const restored = undoComplete(task, history, context.now);
    await updateTaskRow(db, restored);
    await markHistoryUndone(db, history.id, context.now);

    const occurrence = await findOccurrenceByTaskIdRow(db, task.id);
    if (occurrence !== null) {
      await updateOccurrenceStatus(db, occurrence.id, 'pending', context.now, null);
      const rule = await findRuleById(db, occurrence.ruleId);
      if (rule !== null) {
        const nextRule: RecurrenceRule = {
          ...rule,
          completedCount: Math.max(0, rule.completedCount - 1),
          updatedAt: context.now,
        };
        await updateRuleRow(db, nextRule);
        if (rule.repeatAfterCompletion) {
          await dropPendingOccurrencesFrom(db, rule.id, addOneDay(occurrence.occurrenceDate));
        }
      }
    }
    return restored;
  });
}

export async function deleteTaskById(id: string, context: ServiceContext): Promise<DeleteHandle> {
  return m5Transaction(async db => {
    const task = await findTask(db, id);
    if (task === null) {
      throw new AppError({
        code: 'task_not_found',
        category: 'storage',
        message: 'Task not found',
      });
    }
    const deleted = softDeleteTask(task, context.now, createEntityId('tombstone'));
    await updateTaskRow(db, deleted.task);
    await insertTombstone(db, deleted.tombstone);
    await db.execute(
      `UPDATE reminder SET status = 'cancelled', updated_at = ? WHERE task_id = ? AND status = 'scheduled'`,
      [context.now, task.id],
    );

    const occurrence = await findOccurrenceByTaskIdRow(db, task.id);
    if (occurrence !== null) {
      await updateOccurrenceStatus(db, occurrence.id, 'cancelled', context.now, null);
    }

    if (task.isRecurrenceTemplate) {
      const rule = await findRuleByTaskId(db, task.id);
      if (rule !== null) {
        await db.execute('UPDATE recurrence_rule SET is_active = 0, updated_at = ? WHERE id = ?', [
          context.now,
          rule.id,
        ]);
        const pending = await db.execute(
          `SELECT id FROM task WHERE series_id = ? AND status = 'todo'`,
          [task.id],
        );
        for (const row of pending.rows) {
          await db.execute('UPDATE task SET deleted_at = ?, updated_at = ? WHERE id = ?', [
            context.now,
            context.now,
            textValue(row, 'id'),
          ]);
        }
      }
    }

    return { taskId: task.id, undoToken: deleted.tombstone.id, deletedAt: context.now };
  });
}

export async function undoDeleteByToken(token: string, context: ServiceContext): Promise<Task> {
  return m5Transaction(async db => {
    const tombstone = await findActiveTombstone(db, 'task', token);
    const resolved = tombstone ?? (await findTombstoneByIdRow(db, token));
    if (resolved === null) {
      throw new AppError({
        code: 'undo_expired',
        category: 'validation',
        message: 'That undo is no longer available',
      });
    }
    const task = await findTask(db, resolved.entityId);
    if (task === null) {
      throw new AppError({
        code: 'task_not_found',
        category: 'storage',
        message: 'Task not found',
      });
    }
    const restored = restoreDeletedTask(task, context.now);
    await updateTaskRow(db, restored);
    await markTombstoneUndone(db, resolved.id, context.now);
    await db.execute(
      `UPDATE reminder SET status = 'scheduled', updated_at = ? WHERE task_id = ? AND status = 'cancelled'`,
      [context.now, task.id],
    );
    const occurrence = await findOccurrenceByTaskIdRow(db, task.id);
    if (occurrence !== null && occurrence.status === 'cancelled') {
      await updateOccurrenceStatus(db, occurrence.id, 'pending', context.now, null);
    }
    return restored;
  });
}

async function findTombstoneByIdRow(db: DbExecutor, id: string) {
  const result = await db.execute(
    `SELECT id, entity_type, entity_id, payload, deleted_at, undo_expires_at, undone_at
     FROM deleted_tombstone WHERE id = ?`,
    [id],
  );
  const row = result.rows[0];
  if (row === undefined) return null;
  return {
    id: textValue(row, 'id'),
    entityId: textValue(row, 'entity_id'),
  };
}

export async function archiveTaskById(id: string, context: ServiceContext): Promise<Task> {
  return m5Transaction(async db => {
    const task = await findTask(db, id);
    if (task === null) {
      throw new AppError({
        code: 'task_not_found',
        category: 'storage',
        message: 'Task not found',
      });
    }
    const archived = archiveTask(task, context.now);
    await updateTaskRow(db, archived);
    return archived;
  });
}

export async function restoreTaskById(id: string, context: ServiceContext): Promise<Task> {
  return m5Transaction(async db => {
    const task = await findTask(db, id);
    if (task === null) {
      throw new AppError({
        code: 'task_not_found',
        category: 'storage',
        message: 'Task not found',
      });
    }
    const restored = restoreArchivedTask(task, context.now);
    await updateTaskRow(db, restored);
    return restored;
  });
}

export async function duplicateTaskById(id: string, context: ServiceContext): Promise<Task> {
  return m5Transaction(async db => {
    const task = await findTask(db, id);
    if (task === null) {
      throw new AppError({
        code: 'task_not_found',
        category: 'storage',
        message: 'Task not found',
      });
    }
    const copy = duplicateTask(
      { ...task, title: task.title.slice(0, 495) },
      createEntityId('task'),
      context.now,
    );
    await insertTask(db, copy);
    const subtasks = await listSubtasks(db);
    for (const subtask of subtasks.filter(entry => entry.taskId === task.id)) {
      await insertSubtask(db, {
        ...subtask,
        id: createEntityId('subtask'),
        taskId: copy.id,
        createdAt: context.now,
        updatedAt: context.now,
      });
    }
    return copy;
  });
}

export async function moveTaskById(
  id: string,
  listId: string,
  context: ServiceContext,
): Promise<Task> {
  return m5Transaction(async db => {
    const task = await findTask(db, id);
    if (task === null) {
      throw new AppError({
        code: 'task_not_found',
        category: 'storage',
        message: 'Task not found',
      });
    }
    const moved = moveTaskToList(task, listId, context.now);
    await updateTaskRow(db, moved);
    return moved;
  });
}

export async function createListByName(name: string, context: ServiceContext): Promise<TaskList> {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    invalid('A list needs a name', 'list_name_required');
  }
  if (trimmed.length > 80) {
    invalid('List names cannot exceed 80 characters', 'list_name_too_long');
  }
  return m5Transaction(async db => {
    const lists = await listLists(db);
    const clash = lists.some(list => list.name.trim().toLowerCase() === trimmed.toLowerCase());
    if (clash) {
      invalid('A list with that name already exists', 'list_name_duplicate');
    }
    const list: TaskList = {
      id: createEntityId('list'),
      name: trimmed,
      color: null,
      isDefault: false,
      sortOrder: lists.reduce((highest, entry) => Math.max(highest, entry.sortOrder), 0) + 1,
      archivedAt: null,
      createdAt: context.now,
      updatedAt: context.now,
    };
    await insertList(db, list);
    return list;
  });
}

export async function setTaskPriorityById(
  id: string,
  priority: Task['priority'],
  context: ServiceContext,
): Promise<Task> {
  return m5Transaction(async db => {
    const task = await findTask(db, id);
    if (task === null) {
      throw new AppError({
        code: 'task_not_found',
        category: 'storage',
        message: 'Task not found',
      });
    }
    const updated = changeTaskPriority(task, priority, context.now);
    await updateTaskRow(db, updated);
    return updated;
  });
}

export async function addSubtaskToTask(
  taskId: string,
  title: string,
  context: ServiceContext,
): Promise<Subtask> {
  return m5Transaction(async db => {
    const task = await findTask(db, taskId);
    if (task === null) {
      throw new AppError({
        code: 'task_not_found',
        category: 'storage',
        message: 'Task not found',
      });
    }
    const subtasks = (await listSubtasks(db)).filter(entry => entry.taskId === taskId);
    const subtask = createSubtask(
      taskId,
      title,
      createEntityId('subtask'),
      context.now,
      subtasks.length,
    );
    await insertSubtask(db, subtask);
    return subtask;
  });
}

export async function toggleSubtaskById(
  subtaskId: string,
  context: ServiceContext,
): Promise<Subtask> {
  return m5Transaction(async db => {
    const subtask = await findSubtask(db, subtaskId);
    if (subtask === null) {
      throw new AppError({
        code: 'subtask_not_found',
        category: 'storage',
        message: 'Subtask not found',
      });
    }
    const toggled = toggleSubtask(subtask, context.now);
    await updateSubtaskRow(db, toggled);
    return toggled;
  });
}

export async function deleteSubtaskById(
  subtaskId: string,
  context: ServiceContext,
): Promise<Subtask> {
  return m5Transaction(async db => {
    const subtask = await findSubtask(db, subtaskId);
    if (subtask === null) {
      throw new AppError({
        code: 'subtask_not_found',
        category: 'storage',
        message: 'Subtask not found',
      });
    }
    const deleted = softDeleteSubtask(subtask, context.now);
    await updateSubtaskRow(db, deleted);
    return deleted;
  });
}

export async function skipOccurrenceByTaskId(
  taskId: string,
  context: ServiceContext,
): Promise<void> {
  return m5Transaction(async db => {
    const task = await findTask(db, taskId);
    if (task === null) {
      throw new AppError({
        code: 'task_not_found',
        category: 'storage',
        message: 'Task not found',
      });
    }
    const occurrence = await findOccurrenceByTaskIdRow(db, taskId);
    if (occurrence === null) {
      throw new AppError({
        code: 'occurrence_not_found',
        category: 'validation',
        message: 'Only a recurring occurrence can be skipped',
      });
    }
    const skipped: Task = { ...task, status: 'cancelled', updatedAt: context.now };
    await updateTaskRow(db, skipped);
    await updateOccurrenceStatus(db, occurrence.id, 'skipped', context.now, null);
    await db.execute(
      `UPDATE reminder SET status = 'cancelled', updated_at = ? WHERE task_id = ? AND status = 'scheduled'`,
      [context.now, taskId],
    );
  });
}

export async function saveReminderForTask(
  taskId: string,
  input: ReminderInput,
  context: ServiceContext,
): Promise<ReminderDefinition> {
  return m5Transaction(async db => {
    const task = await findTask(db, taskId);
    if (task === null) {
      throw new AppError({
        code: 'task_not_found',
        category: 'storage',
        message: 'Task not found',
      });
    }
    const existing = (await listReminders(db)).filter(reminder => reminder.taskId === taskId);
    const normalized = normalizeReminderInput(input);
    const [keep, ...duplicates] = existing;

    let reminder: ReminderDefinition;
    if (keep === undefined) {
      reminder = await insertReminderDefinition(db, taskId, input, context.now);
    } else {
      // Editing keeps the reminder id so reminder_event history stays linked. The
      // stale schedules are left for the reconcile plan to drop, which keeps their
      // request codes reserved until the native alarm cache has been updated.
      reminder = {
        ...keep,
        ...normalized,
        status: 'scheduled',
        snoozeUntil: null,
        updatedAt: context.now,
      };
      await updateReminderRow(db, reminder);
      for (const duplicate of duplicates) {
        await deleteReminder(db, duplicate.id);
      }
    }
    assertRelativeReminderHasDue(reminder, task);
    return reminder;
  });
}

export async function removeReminderById(
  reminderId: string,
  context: ServiceContext,
): Promise<void> {
  await m5Transaction(async db => {
    await db.execute('UPDATE reminder SET status = ?, updated_at = ? WHERE id = ?', [
      'cancelled',
      context.now,
      reminderId,
    ]);
    await db.execute('DELETE FROM notification_schedule WHERE reminder_id = ?', [reminderId]);
  });
}

/** Removes every reminder for a task. Used when the editor clears reminders. */
export async function clearRemindersForTask(
  taskId: string,
  context: ServiceContext,
): Promise<void> {
  await m5Transaction(async db => {
    const rows = (await listReminders(db)).filter(reminder => reminder.taskId === taskId);
    for (const row of rows) {
      await db.execute('DELETE FROM notification_schedule WHERE reminder_id = ?', [row.id]);
      await db.execute('DELETE FROM reminder WHERE id = ?', [row.id]);
    }
    void context;
  });
}

export async function saveRecurrenceForTask(
  taskId: string,
  input: RecurrenceInput,
  context: ServiceContext,
): Promise<RecurrenceRule> {
  return m5Transaction(async db => {
    const task = await findTask(db, taskId);
    if (task === null) {
      throw new AppError({
        code: 'task_not_found',
        category: 'storage',
        message: 'Task not found',
      });
    }
    const settings = await readSettings(db);
    const pattern = normalizeRecurrencePattern({
      ...input,
      timezone: input.timezone ?? settings.timezone,
    });
    const existing = await findRuleByTaskId(db, taskId);
    const template = editTask(
      { ...task, isRecurrenceTemplate: true },
      { dueDate: pattern.startDate, dueTime: pattern.startTime },
      context.now,
      pattern.timezone,
    );
    await updateTaskRow(db, template);
    if (existing !== null) {
      await dropPendingOccurrencesFrom(
        db,
        existing.id,
        localDateInZone(context.now, pattern.timezone),
      );
      const updatedRule: RecurrenceRule = {
        ...pattern,
        id: existing.id,
        taskId,
        completedCount: existing.completedCount,
        isActive: true,
        createdAt: existing.createdAt,
        updatedAt: context.now,
      };
      await updateRuleRow(db, updatedRule);
      await materializeRule(db, updatedRule, template, {
        now: context.now,
        today: localDateInZone(context.now, pattern.timezone),
        horizonDays: settings.recurrenceHorizonDays,
        timeZone: pattern.timezone,
      });
      return updatedRule;
    }
    const rule: RecurrenceRule = {
      ...pattern,
      id: createEntityId('rule'),
      taskId,
      completedCount: 0,
      isActive: true,
      createdAt: context.now,
      updatedAt: context.now,
    };
    await insertRule(db, rule);
    await materializeRule(db, rule, template, {
      now: context.now,
      today: localDateInZone(context.now, pattern.timezone),
      horizonDays: settings.recurrenceHorizonDays,
      timeZone: pattern.timezone,
    });
    return rule;
  });
}

export async function removeRecurrenceForTask(
  taskId: string,
  context: ServiceContext,
): Promise<void> {
  await m5Transaction(async db => {
    const rule = await findRuleByTaskId(db, taskId);
    if (rule === null) return;
    await dropPendingOccurrencesFrom(db, rule.id, '0000-01-01');
    await db.execute('DELETE FROM recurrence_rule WHERE id = ?', [rule.id]);
    await db.execute('UPDATE task SET is_recurrence_template = 0, updated_at = ? WHERE id = ?', [
      context.now,
      taskId,
    ]);
  });
}

export async function recomputeFloatingTimes(context: ServiceContext): Promise<number> {
  return m5Transaction(async db => {
    const tasks = await listAllTasks(db);
    let changed = 0;
    for (const task of tasks) {
      if (task.dueDate === null) continue;
      const dueAt = deriveDueAt(task.dueDate, task.dueTime, context.timeZone);
      if (dueAt === task.dueAt) continue;
      await updateTaskDueAt(db, task.id, dueAt, context.now);
      changed += 1;
    }
    return changed;
  });
}

export interface ReminderSummaryContext {
  readonly tasks: readonly Task[];
  readonly reminders: readonly ReminderDefinition[];
  readonly schedules: Awaited<ReturnType<typeof listSchedules>>;
  readonly occurrences: Awaited<ReturnType<typeof listOccurrencesForRule>>;
  readonly rules: readonly RecurrenceRule[];
}

export function buildReminderSummaries(
  context: ReminderSummaryContext,
): Readonly<Record<string, ReminderStatusSummary[]>> {
  const byTask = new Map<string, ReminderStatusSummary[]>();
  for (const reminder of context.reminders) {
    const schedule = context.schedules
      .filter(row => row.reminderId === reminder.id && row.status === 'scheduled')
      .sort((left, right) => left.scheduledAt - right.scheduledAt)[0];
    const list = byTask.get(reminder.taskId) ?? [];
    list.push({
      id: reminder.id,
      taskId: reminder.taskId,
      label: reminder.label,
      kind: reminder.kind,
      offsetMinutes: reminder.offsetMinutes,
      localDate: reminder.localDate,
      localTime: reminder.localTime,
      status: reminder.status,
      isExact: reminder.isExact,
      nextTriggerAt: schedule?.scheduledAt ?? null,
      scheduleState: schedule?.state ?? null,
    });
    byTask.set(reminder.taskId, list);
  }
  return Object.fromEntries(byTask);
}

export function buildRecurrenceSummaries(
  context: ReminderSummaryContext,
): Readonly<Record<string, RecurrenceStatusSummary>> {
  const result: Record<string, RecurrenceStatusSummary> = {};
  const occurrences = context.occurrences;

  for (const task of context.tasks) {
    if (task.seriesId === null && !task.isRecurrenceTemplate) continue;
    const seriesId = task.seriesId ?? task.id;
    const rule = context.rules.find(entry => entry.taskId === seriesId);
    if (rule === undefined) continue;
    const seriesTaskIds = new Set(
      context.tasks.filter(entry => entry.seriesId === seriesId).map(entry => entry.id),
    );
    const pending = occurrences
      .filter(
        entry =>
          entry.ruleId === rule.id && entry.status === 'pending' && seriesTaskIds.has(entry.taskId),
      )
      .sort((left, right) => left.occurrenceDate.localeCompare(right.occurrenceDate));
    const next = pending[0] ?? null;
    const current = occurrences.find(entry => entry.taskId === task.id) ?? null;
    result[task.id] = {
      ruleId: rule.id,
      seriesId,
      frequency: rule.frequency === 'weekly' ? `weekly:${rule.weekdays.join(',')}` : rule.frequency,
      nextDate: next?.occurrenceDate ?? null,
      nextTime: next?.occurrenceTime ?? null,
      occurrenceStatus: current?.status ?? null,
      completedCount: rule.completedCount,
    };
  }
  return result;
}

export interface SnapshotFilter {
  readonly filter: TaskFilter;
  readonly timeZone: string;
  readonly now?: number;
}

export interface TaskDetailQuery {
  readonly id: string;
  readonly timeZone: string;
  readonly now?: number;
}

/**
 * Loads everything the detail screen needs for one task, including tasks that
 * are no longer visible in a list (completed, archived, or deleted).
 */
export async function loadTaskDetail(query: TaskDetailQuery): Promise<TaskDetail | null> {
  return m5Read(async db => {
    const task = await findTask(db, query.id);
    if (task === null) return null;

    const now = query.now ?? systemClock.now().getTime();
    const today = localDateInZone(now, query.timeZone);
    const ownerId = task.seriesId ?? task.id;
    const subtasks = (await listSubtasks(db)).filter(entry => entry.taskId === task.id);
    const allTasks = await listAllTasks(db);
    const rules = await listRules(db);
    const reminders = await listReminders(db);
    const schedules = await listSchedules(db);
    const occurrences = (
      await Promise.all(rules.map(rule => listOccurrencesForRule(db, rule.id)))
    ).flat();

    const context: ReminderSummaryContext = {
      tasks: allTasks,
      reminders,
      schedules,
      occurrences,
      rules,
    };
    const remindersByTask = buildReminderSummaries(context);
    const recurrenceByTask = buildRecurrenceSummaries(context);
    const listName = (await listLists(db)).find(entry => entry.id === task.listId)?.name ?? null;

    const taskReminders = Object.values(remindersByTask)
      .flat()
      .filter(summary => {
        const definition = reminders.find(row => row.id === summary.id);
        return (
          definition !== undefined &&
          (definition.taskId === task.id || definition.taskId === ownerId)
        );
      });

    return {
      task,
      subtasks,
      reminders: taskReminders,
      recurrence: recurrenceByTask[task.id] ?? recurrenceByTask[ownerId] ?? null,
      listName,
      today,
      timezone: query.timeZone,
    };
  });
}

export async function loadTaskSnapshot(options: SnapshotFilter): Promise<TaskSnapshot> {
  return m5Read(async db => {
    const now = options.now ?? systemClock.now().getTime();
    const today = localDateInZone(now, options.timeZone);
    const tasks = await listVisibleTasks(db, options.filter, today);
    const subtasks = await listSubtasks(db);
    const allTasks = await listAllTasks(db);
    const rules = await listRules(db);
    const reminders = await listReminders(db);
    const schedules = await listSchedules(db);
    const allOccurrenceRows = (
      await Promise.all(rules.map(rule => listOccurrencesForRule(db, rule.id)))
    ).flat();

    const summaryContext: ReminderSummaryContext = {
      tasks: allTasks,
      reminders,
      schedules,
      occurrences: allOccurrenceRows,
      rules,
    };
    const remindersByTask = buildReminderSummaries(summaryContext);
    const recurrence = buildRecurrenceSummaries(summaryContext);

    const withDetails: TaskWithDetails[] = tasks.map(task => ({
      task,
      subtasks: subtasks.filter(subtask => subtask.taskId === task.id),
    }));

    const nativeSettings = await readNativeSettings(db);
    return {
      tasks: withDetails,
      lists: await listLists(db),
      archivedCount: await countArchivedTasks(db),
      today,
      reminders: reminders.map(reminder => {
        const summaries = remindersByTask[reminder.taskId] ?? [];
        return (
          summaries.find(entry => entry.id === reminder.id) ?? {
            id: reminder.id,
            taskId: reminder.taskId,
            label: reminder.label,
            kind: reminder.kind,
            offsetMinutes: reminder.offsetMinutes,
            localDate: reminder.localDate,
            localTime: reminder.localTime,
            status: reminder.status,
            isExact: reminder.isExact,
            nextTriggerAt: null,
            scheduleState: null,
          }
        );
      }),
      recurrence,
      notificationState: {
        permission: nativeSettings.permission,
        exactAlarm: nativeSettings.exactAlarm,
        scheduledCount: schedules.filter(row => row.status === 'scheduled').length,
        deferredCount: schedules.filter(row => row.state === 'deferred-cap').length,
        errorCount: schedules.filter(row => row.state === 'error').length,
      },
      revision: now,
    };
  });
}

async function readNativeSettings(db: DbExecutor): Promise<{
  permission: 'granted' | 'denied' | 'notDetermined';
  exactAlarm: 'granted' | 'denied' | 'notApplicable';
}> {
  const result = await db.execute(
    `SELECT key, value FROM settings WHERE key IN ('native_notification_permission', 'native_exact_alarm')`,
  );
  const values = new Map<string, string>();
  for (const row of result.rows) {
    values.set(textValue(row, 'key'), textValue(row, 'value'));
  }
  const permission = values.get('native_notification_permission');
  const exact = values.get('native_exact_alarm');
  return {
    permission: permission === 'granted' || permission === 'denied' ? permission : 'notDetermined',
    exactAlarm: exact === 'granted' || exact === 'denied' ? exact : 'notApplicable',
  };
}

/** Reads the persisted notification settings (quiet hours, snooze, time zone). */
export async function loadNotificationSettings(): Promise<NotificationSettings> {
  return m5Read(async db => readSettings(db));
}

export async function saveNotificationSettings(
  patch: Partial<NotificationSettings>,
  context: ServiceContext,
): Promise<NotificationSettings> {
  const { writeSettings } = await import('@/notifications/repository');
  return m5Transaction(async db => {
    await writeSettings(db, patch, context.now);
    return readSettings(db);
  });
}
