import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { TaskStoreContext, type TaskStore } from './store';

export interface TaskStoreProviderProps {
  readonly store: TaskStore;
  readonly children: ReactNode;
}

const RevisionContext = createContext(0);

/**
 * Holds the store and exposes a revision counter that increments after every
 * mutation. Screens reload their snapshot when the revision changes.
 */
export function TaskStoreProvider({ store, children }: TaskStoreProviderProps): React.JSX.Element {
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    return store.subscribe(() => setRevision(value => value + 1));
  }, [store]);

  const value = useMemo(() => revision, [revision]);

  return (
    <TaskStoreContext.Provider value={store}>
      <RevisionContext.Provider value={value}>{children}</RevisionContext.Provider>
    </TaskStoreContext.Provider>
  );
}

export function useStoreRevision(): number {
  return useContext(RevisionContext);
}
