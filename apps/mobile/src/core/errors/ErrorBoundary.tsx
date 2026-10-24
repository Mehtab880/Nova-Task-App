import { Component, type ErrorInfo, type PropsWithChildren, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/design/AppText';
import { useTheme } from '@/design/ThemeProvider';
import { noopCrashReporter, type CrashReporter } from '@/core/crash/CrashReporter';
import { logger } from '@/core/logging';

export interface ErrorBoundaryProps {
  readonly crashReporter?: CrashReporter;
}

interface ErrorBoundaryState {
  readonly hasError: boolean;
}

interface ErrorFallbackProps {
  readonly onRetry: () => void;
}

function ErrorFallback({ onRetry }: ErrorFallbackProps): ReactNode {
  const theme = useTheme();
  const { t } = useTranslation();

  return (
    <View
      style={[
        styles.fallback,
        { backgroundColor: theme.colors.surface, padding: theme.spacing.xl },
      ]}
    >
      <AppText variant="heading" accessibilityRole="header">
        {t('errorBoundary.title')}
      </AppText>
      <View style={{ height: theme.spacing.md }} />
      <AppText variant="body" color="textMuted">
        {t('errorBoundary.description')}
      </AppText>
      <View style={{ height: theme.spacing.xl }} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('errorBoundary.restart')}
        accessibilityHint={t('errorBoundary.restartHint')}
        onPress={onRetry}
        style={({ pressed }) => [
          styles.retry,
          {
            minHeight: theme.sizes.touchMinimum,
            minWidth: theme.sizes.touchMinimum,
            paddingHorizontal: theme.spacing.lg,
            borderRadius: theme.radius.md,
            backgroundColor: pressed ? theme.colors.brandPrimaryPressed : theme.colors.brandPrimary,
          },
        ]}
      >
        <AppText variant="button" color="onBrandPrimary">
          {t('errorBoundary.restart')}
        </AppText>
      </Pressable>
    </View>
  );
}

/**
 * Last-resort UI boundary. Domain errors should be handled before reaching
 * this component; this only protects against unexpected render failures.
 */
export class ErrorBoundary extends Component<
  PropsWithChildren<ErrorBoundaryProps>,
  ErrorBoundaryState
> {
  override state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    const reporter = this.props.crashReporter ?? noopCrashReporter;
    reporter.recordError(error, { componentStack: info.componentStack ?? '' });
    logger.error('Unhandled render error', {
      error: error.message,
      componentStack: info.componentStack ?? '',
    });
  }

  private readonly retry = (): void => {
    this.setState({ hasError: false });
  };

  override render(): ReactNode {
    if (this.state.hasError) {
      return <ErrorFallback onRetry={this.retry} />;
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  fallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  retry: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
