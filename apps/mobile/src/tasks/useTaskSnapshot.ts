import { useCallback, useEffect, useRef, useState } from 'react';

import { AppError } from '@/core/errors/AppError';

import type { TaskFilter } from './repository';
import { useTaskStore } from './store';
import { useStoreRevision } from './TaskStoreProvider';
import type { TaskSnapshot } from './types';

export type SnapshotStatus = 'loading' | 'ready' | 'error';

export interface TaskSnapshotState {
  readonly status: SnapshotStatus;
  readonly snapshot: TaskSnapshot | null;
  readonly error: AppError | null;
  readonly reload: () => Promise<void>;
}

/**
 * Loads one task filter and reloads on every store mutation. A monotonic
 * request id prevents a slow earlier read from overwriting a newer one.
 */
export function useTaskSnapshot(filter: TaskFilter): TaskSnapshotState {
  const store = useTaskStore();
  const revision = useStoreRevision();
  const [status, setStatus] = useState<SnapshotStatus>('loading');
  const [snapshot, setSnapshot] = useState<TaskSnapshot | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const requestId = useRef(0);

  const reload = useCallback(async () => {
    const id = requestId.current + 1;
    requestId.current = id;
    setStatus(current => (current === 'ready' ? current : 'loading'));
    try {
      const next = await store.loadTasks(filter);
      if (requestId.current !== id) return;
      setSnapshot(next);
      setError(null);
      setStatus('ready');
    } catch (cause) {
      if (requestId.current !== id) return;
      setError(AppError.fromUnknown(cause));
      setStatus('error');
    }
  }, [filter, store]);

  useEffect(() => {
    // Loading reads an external store; run it from a microtask so the effect
    // never writes state during the commit phase.
    void Promise.resolve().then(reload);
  }, [reload, revision]);

  return { status, snapshot, error, reload };
}
