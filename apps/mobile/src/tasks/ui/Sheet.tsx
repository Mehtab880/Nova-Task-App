import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { AppButton } from '@/design/AppButton';
import { AppText } from '@/design/AppText';
import { useTheme } from '@/design/ThemeProvider';

export interface SheetProps {
  readonly visible: boolean;
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  readonly testID?: string;
}

/** Bottom sheet with a 48dp close target and modal accessibility semantics. */
export function Sheet({
  visible,
  title,
  onClose,
  children,
  footer,
  testID,
}: SheetProps): React.JSX.Element {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: theme.colors.scrim }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('tasks.sheet.dismiss')}
          onPress={onClose}
          style={{ flex: 1 }}
        />
        <View
          testID={testID}
          style={{
            maxHeight: '88%',
            backgroundColor: theme.colors.surface,
            borderTopLeftRadius: theme.radius.xl,
            borderTopRightRadius: theme.radius.xl,
            paddingBottom: insets.bottom + theme.spacing.md,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.md,
              padding: theme.spacing.lg,
              borderBottomWidth: theme.sizes.borderHairline,
              borderBottomColor: theme.colors.border,
            }}
          >
            <AppText variant="heading" style={{ flex: 1 }} accessibilityRole="header">
              {title}
            </AppText>
            <AppButton
              label={t('tasks.sheet.close')}
              onPress={onClose}
              variant="ghost"
              accessibilityLabel={t('tasks.sheet.close')}
            />
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.md }}
          >
            {children}
          </ScrollView>
          {footer === undefined ? null : (
            <View
              style={{
                padding: theme.spacing.lg,
                borderTopWidth: theme.sizes.borderHairline,
                borderTopColor: theme.colors.border,
                gap: theme.spacing.sm,
              }}
            >
              {footer}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}
