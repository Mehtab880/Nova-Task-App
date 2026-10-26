import { useCallback, useEffect, useRef, useState } from 'react';

import { AppError } from '@/core/errors/AppError';

import { useTaskStore } from './store';
import { useStoreRevision } from './TaskStoreProvider';
import type { TaskDetail } from './types';

export type DetailStatus = 'loading' | 'ready' | 'missing' | 'error';

export interface TaskDetailState {
  readonly status: DetailStatus;
  readonly detail: TaskDetail | null;
  readonly error: AppError | null;
  readonly reload: () => Promise<void>;
}

/** Loads one task and reloads after every store mutation. */
export function useTaskDetail(taskId: string | null): TaskDetailState {
  const store = useTaskStore();
  const revision = useStoreRevision();
  const [status, setStatus] = useState<DetailStatus>('loading');
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const requestId = useRef(0);

  const reload = useCallback(async () => {
    if (taskId === null) return;
    const id = requestId.current + 1;
    requestId.current = id;
    try {
      const next = await store.loadTask(taskId);
      if (requestId.current !== id) return;
      setDetail(next);
      setError(null);
      setStatus(next === null ? 'missing' : 'ready');
    } catch (cause) {
      if (requestId.current !== id) return;
      setError(AppError.fromUnknown(cause));
      setStatus('error');
    }
  }, [store, taskId]);

  useEffect(() => {
    if (taskId === null) return;
    // Loading reads an external store; run it from a microtask so the effect
    // never writes state during the commit phase.
    void Promise.resolve().then(reload);
  }, [reload, revision, taskId]);

  // The caller always has an answer for a null id, so no storage read or state
  // update is needed. Deriving it here keeps the effect free of synchronous
  // state writes.
  if (taskId === null) {
    return { status: 'missing', detail: null, error: null, reload };
  }

  return { status, detail, error, reload };
}
