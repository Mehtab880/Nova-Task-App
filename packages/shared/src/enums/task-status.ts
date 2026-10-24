/**
 * Lifecycle state of a task. Persistence arrives in a later milestone.
 */
export const TaskStatus = {
  Todo: 'todo',
  InProgress: 'in_progress',
  Done: 'done',
  Cancelled: 'cancelled',
} as const;

export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];
