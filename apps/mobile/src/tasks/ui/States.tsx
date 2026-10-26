import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppButton } from '@/design/AppButton';
import { AppText } from '@/design/AppText';
import { useTheme } from '@/design/ThemeProvider';

export function LoadingState(): React.JSX.Element {
  const theme = useTheme();
  const { t } = useTranslation();
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t('tasks.state.loading')}
      accessibilityLiveRegion="polite"
      style={{ padding: theme.spacing.xl, gap: theme.spacing.sm }}
    >
      <AppText variant="body" color="textMuted">
        {t('tasks.state.loading')}
      </AppText>
    </View>
  );
}

export interface EmptyStateProps {
  readonly title: string;
  readonly description: string;
}

export function EmptyState({ title, description }: EmptyStateProps): React.JSX.Element {
  const theme = useTheme();
  return (
    <View
      accessible
      style={{
        padding: theme.spacing.xl,
        gap: theme.spacing.sm,
        alignItems: 'center',
      }}
    >
      <AppText variant="heading">{title}</AppText>
      <AppText variant="body" color="textMuted" style={{ textAlign: 'center' }}>
        {description}
      </AppText>
    </View>
  );
}

export interface ErrorStateProps {
  readonly message: string;
  readonly onRetry: () => void;
}

/** Error announcements use a polite live region so TalkBack reads them. */
export function ErrorState({ message, onRetry }: ErrorStateProps): React.JSX.Element {
  const theme = useTheme();
  const { t } = useTranslation();
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        margin: theme.spacing.lg,
        padding: theme.spacing.lg,
        borderRadius: theme.radius.lg,
        backgroundColor: theme.colors.errorSurface,
        gap: theme.spacing.md,
      }}
    >
      <AppText variant="heading" color="error">
        {t('tasks.state.errorTitle')}
      </AppText>
      <AppText variant="body" color="error">
        {message}
      </AppText>
      <AppButton
        label={t('tasks.actions.retry')}
        onPress={onRetry}
        variant="secondary"
        accessibilityHint={t('tasks.state.retryHint')}
      />
    </View>
  );
}

export function OfflineNotice(): React.JSX.Element {
  const theme = useTheme();
  const { t } = useTranslation();
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        marginHorizontal: theme.spacing.lg,
        marginBottom: theme.spacing.sm,
        padding: theme.spacing.md,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.warningSurface,
      }}
    >
      <AppText variant="bodySmall" color="onWarning">
        {t('tasks.state.offline')}
      </AppText>
    </View>
  );
}
