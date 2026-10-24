import { Pressable, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from '@/design/AppText';
import { useTheme } from '@/design/ThemeProvider';

export type ActionButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export interface ActionButtonProps {
  readonly label: string;
  readonly onPress: () => void;
  readonly variant?: ActionButtonVariant;
  readonly disabled?: boolean;
  readonly accessibilityHint?: string;
  readonly selected?: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
}

export function ActionButton({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  accessibilityHint,
  selected,
  style,
  testID,
}: ActionButtonProps): React.JSX.Element {
  const theme = useTheme();

  const colors =
    variant === 'primary'
      ? { background: theme.colors.brandPrimary, text: theme.colors.onBrandPrimary }
      : variant === 'danger'
        ? { background: theme.colors.errorSurface, text: theme.colors.error }
        : variant === 'ghost'
          ? { background: theme.colors.surfaceSunken, text: theme.colors.text }
          : {
              background: theme.colors.surfaceRaised,
              text: theme.colors.text,
            };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{
        disabled,
        ...(selected === undefined ? {} : { selected }),
      }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        {
          minHeight: theme.sizes.touchMinimum,
          paddingHorizontal: theme.spacing.lg,
          paddingVertical: theme.spacing.sm,
          borderRadius: theme.radius.md,
          borderWidth: variant === 'secondary' ? theme.sizes.borderHairline : 0,
          borderColor: theme.colors.border,
          backgroundColor: disabled
            ? theme.colors.disabledSurface
            : pressed
              ? theme.colors.surfaceSunken
              : colors.background,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      <AppText
        variant="button"
        style={{ color: disabled ? theme.colors.disabledText : colors.text }}
        numberOfLines={2}
      >
        {label}
      </AppText>
    </Pressable>
  );
}
