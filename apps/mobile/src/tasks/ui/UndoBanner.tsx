import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppButton } from '@/design/AppButton';
import { AppText } from '@/design/AppText';
import { useTheme } from '@/design/ThemeProvider';

export interface UndoBannerProps {
  readonly message: string;
  readonly onUndo: () => void;
  readonly onDismiss: () => void;
  readonly undoLabel?: string;
}

/**
 * Durable, keyboard- and TalkBack-reachable undo affordance. It is never the
 * only way to recover: deleted tasks stay restorable from their tombstone.
 */
export function UndoBanner({
  message,
  onUndo,
  onDismiss,
  undoLabel,
}: UndoBannerProps): React.JSX.Element {
  const theme = useTheme();
  const { t } = useTranslation();

  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        marginHorizontal: theme.spacing.lg,
        marginBottom: theme.spacing.sm,
        padding: theme.spacing.md,
        borderRadius: theme.radius.lg,
        backgroundColor: theme.colors.surfaceSunken,
        borderWidth: theme.sizes.borderHairline,
        borderColor: theme.colors.border,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
      }}
    >
      <AppText variant="bodySmall" style={{ flex: 1 }}>
        {message}
      </AppText>
      <AppButton
        label={undoLabel ?? t('tasks.undo.action')}
        onPress={onUndo}
        variant="secondary"
        accessibilityHint={t('tasks.undo.hint')}
        testID="undo-button"
      />
      <AppButton
        label={t('tasks.undo.dismiss')}
        onPress={onDismiss}
        variant="ghost"
        accessibilityLabel={t('tasks.undo.dismiss')}
      />
    </View>
  );
}
