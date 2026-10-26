import {
  archiveTask,
  changeTaskPriority,
  completeTask,
  createSubtask,
  createTask,
  deriveDueAt,
  duplicateTask,
  editSubtask,
  editTask,
  moveTaskToList,
  recomputeTaskForTimeZone,
  restoreArchivedTask,
  restoreDeletedTask,
  softDeleteSubtask,
  softDeleteTask,
  toggleSubtask,
  undoComplete,
  validateTaskDraft,
} from './lifecycle';
import type { Task } from './types';

const NOW = 1_772_000_000_000; // 2026-02-27T...Z
const CONTEXT = {
  id: 'task_00000000000000000000000001',
  now: NOW,
  timeZone: 'America/New_York',
  defaultListId: 'list_00000000000000000000000000',
};

function task(overrides: Partial<Task> = {}): Task {
  return {
    ...createTask({ title: 'Write the plan' }, CONTEXT),
    ...overrides,
  };
}

describe('task lifecycle', () => {
  it('creates a normalized task in the default list', () => {
    const created = createTask(
      {
        title: '  Write   the plan  ',
        notes: '  detail  ',
        priority: 'high',
        dueDate: '2026-03-01',
        dueTime: '09:30',
      },
      CONTEXT,
    );
    expect(created).toEqual(
      expect.objectContaining({
        title: 'Write the plan',
        notes: 'detail',
        priority: 'high',
        listId: CONTEXT.defaultListId,
        dueDate: '2026-03-01',
        dueTime: '09:30',
        isAllDay: false,
        status: 'todo',
      }),
    );
    expect(created.dueAt).toBe(Date.UTC(2026, 2, 1, 14, 30));
  });

  it('treats a date without a time as all-day end-of-day ordering', () => {
    const created = createTask({ title: 'All day', dueDate: '2026-03-01' }, CONTEXT);
    expect(created.isAllDay).toBe(true);
    expect(created.dueAt).toBe(deriveDueAt('2026-03-01', null, CONTEXT.timeZone));
    expect(created.dueAt).toBe(Date.UTC(2026, 2, 2, 4, 59));
  });

  it('edits title, notes, priority, list, date, and time', () => {
    const edited = editTask(
      task(),
      {
        title: 'Ship M5',
        notes: 'Local first',
        priority: 'urgent',
        listId: 'list_00000000000000000000000002',
        dueDate: '2026-04-02',
        dueTime: '16:45',
      },
      NOW + 1_000,
      CONTEXT.timeZone,
    );
    expect(edited).toEqual(
      expect.objectContaining({
        title: 'Ship M5',
        notes: 'Local first',
        priority: 'urgent',
        listId: 'list_00000000000000000000000002',
        dueDate: '2026-04-02',
        dueTime: '16:45',
        isAllDay: false,
        updatedAt: NOW + 1_000,
      }),
    );
  });

  it('recomputes dueAt when the time zone changes', () => {
    const created = createTask(
      { title: 'Floating', dueDate: '2026-03-01', dueTime: '09:00' },
      CONTEXT,
    );
    const tokyo = recomputeTaskForTimeZone(created, 'Asia/Tokyo', NOW + 1);
    expect(tokyo.dueAt).not.toBe(created.dueAt);
    expect(tokyo.dueAt! - created.dueAt!).toBe(-14 * 60 * 60 * 1_000);
  });

  it('completes a task and records undo history', () => {
    const source = task();
    const result = completeTask(source, NOW + 5_000, {
      historyId: 'history_1',
      undoToken: 'undo_1',
    });
    expect(result.task.status).toBe('done');
    expect(result.task.completedAt).toBe(NOW + 5_000);
    expect(result.history).toEqual(
      expect.objectContaining({
        taskId: source.id,
        taskTitle: source.title,
        previousStatus: 'todo',
        completedAt: NOW + 5_000,
        undoToken: 'undo_1',
      }),
    );
  });

  it('is idempotent when completing an already completed task', () => {
    const done = completeTask(task(), NOW, { historyId: 'h', undoToken: 'u' }).task;
    const again = completeTask(done, NOW + 1, { historyId: 'h2', undoToken: 'u2' });
    expect(again.task).toBe(done);
    expect(again.history).toBeNull();
  });

  it('undoes completion to the previous status', () => {
    const source = task({ status: 'in_progress' });
    const completed = completeTask(source, NOW + 1, { historyId: 'h', undoToken: 'u' });
    expect(completed.history).not.toBeNull();
    const restored = undoComplete(completed.task, completed.history!, NOW + 2);
    expect(restored.status).toBe('in_progress');
    expect(restored.completedAt).toBeNull();
  });

  it('archives and restores a task', () => {
    const archived = archiveTask(task(), NOW + 1);
    expect(archived.archivedAt).toBe(NOW + 1);
    const restored = restoreArchivedTask(archived, NOW + 2);
    expect(restored.archivedAt).toBeNull();
  });

  it('soft deletes with a tombstone and restores', () => {
    const source = task();
    const deleted = softDeleteTask(source, NOW + 1, 'tombstone_1');
    expect(deleted.task.deletedAt).toBe(NOW + 1);
    expect(deleted.tombstone).toEqual(
      expect.objectContaining({
        entityType: 'task',
        entityId: source.id,
        deletedAt: NOW + 1,
      }),
    );
    expect(JSON.parse(deleted.tombstone.payload)).toEqual(source);
    expect(restoreDeletedTask(deleted.task, NOW + 2).deletedAt).toBeNull();
  });

  it('duplicates a task with a new identity and a copy title', () => {
    const source = task({ status: 'done', completedAt: NOW, dueDate: '2026-03-01' });
    const copy = duplicateTask(source, 'task_copy', NOW + 1);
    expect(copy.id).toBe('task_copy');
    expect(copy.title).toBe('Write the plan (copy)');
    expect(copy.status).toBe('todo');
    expect(copy.completedAt).toBeNull();
    expect(copy.dueDate).toBe('2026-03-01');
    expect(copy.createdAt).toBe(NOW + 1);
  });

  it('moves to another list and changes priority', () => {
    const moved = moveTaskToList(task(), 'list_other', NOW + 1);
    expect(moved.listId).toBe('list_other');
    expect(changeTaskPriority(moved, 'low', NOW + 2).priority).toBe('low');
  });

  it('adds, edits, toggles, and removes subtasks', () => {
    const created = createSubtask('task_1', '  Draft  ', 'subtask_1', NOW, 2);
    expect(created).toEqual(
      expect.objectContaining({ title: 'Draft', isCompleted: false, sortOrder: 2 }),
    );
    const edited = editSubtask(created, 'Draft v2', NOW + 1);
    expect(edited.title).toBe('Draft v2');
    const toggled = toggleSubtask(edited, NOW + 2);
    expect(toggled.isCompleted).toBe(true);
    expect(softDeleteSubtask(toggled, NOW + 3).deletedAt).toBe(NOW + 3);
  });

  it('validates title, notes, date, time, and priority', () => {
    expect(() => validateTaskDraft({ title: '   ' })).toThrow('A task title is required');
    expect(() => validateTaskDraft({ title: 'x'.repeat(501) })).toThrow('cannot exceed 500');
    expect(() => validateTaskDraft({ title: 'x', notes: 'x'.repeat(10_001) })).toThrow(
      'cannot exceed 10000',
    );
    expect(() => validateTaskDraft({ title: 'x', dueTime: '09:00' })).toThrow(
      'A due time requires a due date',
    );
    expect(() => validateTaskDraft({ title: 'x', dueDate: '2026-02-30' })).toThrow(
      'Invalid task due date',
    );
    expect(() =>
      validateTaskDraft({ title: 'x', dueDate: '2026-02-28', dueTime: '24:00' }),
    ).toThrow('Invalid task due time');
    expect(() => validateTaskDraft({ title: 'x', priority: 'extreme' as never })).toThrow(
      'Unsupported task priority',
    );
  });

  it('rejects mismatched completion history', () => {
    const completed = completeTask(task(), NOW, { historyId: 'h', undoToken: 'u' });
    expect(() =>
      undoComplete(task({ id: 'other' }), { ...completed.history!, taskId: 'someone-else' }, NOW),
    ).toThrow('does not belong');
  });
});
