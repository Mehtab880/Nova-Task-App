import { useEffect, useMemo } from 'react';
import { StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import '@/i18n';

import { environment } from '@/core/env/environment';
import { ErrorBoundary } from '@/core/errors/ErrorBoundary';
import { logger } from '@/core/logging';
import { ThemeProvider, useTheme } from '@/design/ThemeProvider';
import { RootNavigator } from '@/navigation/RootNavigator';
import { createSqliteTaskStore } from '@/tasks/sqliteStore';
import { TaskStoreProvider } from '@/tasks/TaskStoreProvider';
import { useNovaRuntime } from '@/tasks/useNovaRuntime';

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});

function AppContent(): React.JSX.Element {
  const theme = useTheme();
  useNovaRuntime();

  useEffect(() => {
    if (!environment.m0SpikeEnabled) {
      return;
    }

    let cancelled = false;

    void import('@/db/m0-spike-runner')
      .then(async ({ runM0SpikeAndLog }) => {
        if (!cancelled) {
          await runM0SpikeAndLog();
        }
      })
      .catch((error: unknown) => {
        logger.error('Failed to load the M0 spike runner', {
          error: error instanceof Error ? error.message : String(error),
        });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.surface }]}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} />
      <ErrorBoundary>
        <RootNavigator />
      </ErrorBoundary>
    </View>
  );
}

export default function App(): React.JSX.Element {
  const store = useMemo(() => createSqliteTaskStore(), []);

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <TaskStoreProvider store={store}>
          <AppContent />
        </TaskStoreProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
