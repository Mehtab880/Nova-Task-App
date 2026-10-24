import type { ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/design/AppText';
import { useTheme } from '@/design/ThemeProvider';

export interface ReminderScreenShellProps {
  readonly title: string;
  readonly subtitle?: string;
  readonly onBack: () => void;
  readonly children: ReactNode;
}

/** Dev-screen shell matching the 56dp header and safe-area contract. */
export function ReminderScreenShell({
  title,
  subtitle,
  onBack,
  children,
}: ReminderScreenShellProps): React.JSX.Element {
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
            minHeight: theme.sizes.headerHeight,
            paddingHorizontal: theme.spacing.sm,
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            onPress={onBack}
            hitSlop={theme.spacing.sm}
            style={({ pressed }) => ({
              minHeight: theme.sizes.touchMinimum,
              minWidth: theme.sizes.touchMinimum,
              paddingHorizontal: theme.spacing.sm,
              justifyContent: 'center',
              borderRadius: theme.radius.md,
              backgroundColor: pressed ? theme.colors.surfaceSunken : theme.colors.surfaceRaised,
            })}
          >
            <AppText variant="button" color="brandPrimary">
              {t('common.back')}
            </AppText>
          </Pressable>
          <AppText
            variant="subheading"
            accessibilityRole="header"
            numberOfLines={1}
            style={{ flex: 1 }}
          >
            {title}
          </AppText>
        </View>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          padding: theme.spacing.lg,
          paddingBottom: insets.bottom + theme.spacing.xxl,
          gap: theme.spacing.lg,
        }}
      >
        {subtitle === undefined ? null : (
          <AppText variant="body" color="textMuted">
            {subtitle}
          </AppText>
        )}
        {children}
      </ScrollView>
    </View>
  );
}
