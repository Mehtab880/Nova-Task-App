import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/design/AppText';
import { useTheme } from '@/design/ThemeProvider';

export interface PlaceholderScreenProps {
  readonly title: string;
  readonly description: string;
  readonly footer?: ReactNode;
}

/**
 * M0 shell only. The four tabs intentionally share this non-feature screen;
 * no task, calendar, AI, or billing behavior is implemented.
 */
export function PlaceholderScreen({
  title,
  description,
  footer,
}: PlaceholderScreenProps): React.JSX.Element {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.surface }}>
      <View
        style={{
          paddingTop: insets.top,
          backgroundColor: theme.colors.surfaceRaised,
          borderBottomColor: theme.colors.border,
          borderBottomWidth: theme.sizes.borderHairline,
        }}
      >
        <View
          style={{
            height: theme.sizes.headerHeight,
            paddingHorizontal: theme.spacing.lg,
            justifyContent: 'center',
          }}
        >
          <AppText variant="heading" accessibilityRole="header" numberOfLines={1}>
            {title}
          </AppText>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: theme.spacing.xl }}>
        <View
          style={{
            alignSelf: 'flex-start',
            paddingHorizontal: theme.spacing.md,
            paddingVertical: theme.spacing.xs,
            borderRadius: theme.radius.full,
            backgroundColor: theme.colors.brandPrimaryMuted,
          }}
        >
          <AppText variant="caption" color="brandPrimary">
            {t('common.milestone')}
          </AppText>
        </View>

        <View style={{ height: theme.spacing.lg }} />

        <AppText variant="body" color="textMuted">
          {description}
        </AppText>

        <View style={{ height: theme.spacing.md }} />

        <AppText variant="bodySmall" color="disabledText">
          {t('common.notImplemented')}
        </AppText>

        {footer === undefined ? null : (
          <>
            <View style={{ height: theme.spacing.xl }} />
            {footer}
          </>
        )}
      </ScrollView>
    </View>
  );
}
