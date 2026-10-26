import { Pressable, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from './AppText';
import { useTheme } from './ThemeProvider';

export type AppButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export interface AppButtonProps {
  readonly label: string;
  readonly onPress: () => void;
  readonly variant?: AppButtonVariant;
  readonly disabled?: boolean;
  readonly accessibilityHint?: string;
  readonly accessibilityLabel?: string;
  readonly selected?: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
}

/** Generic 48dp button used by M5 screens. Colour comes only from tokens. */
export function AppButton({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  accessibilityHint,
  accessibilityLabel,
  selected,
  style,
  testID,
}: AppButtonProps): React.JSX.Element {
  const theme = useTheme();

  const colors =
    variant === 'primary'
      ? { background: theme.colors.brandPrimary, text: theme.colors.onBrandPrimary }
      : variant === 'danger'
        ? { background: theme.colors.errorSurface, text: theme.colors.error }
        : variant === 'ghost'
          ? { background: theme.colors.surfaceSunken, text: theme.colors.text }
          : { background: theme.colors.surfaceRaised, text: theme.colors.text };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      {...(accessibilityHint === undefined ? {} : { accessibilityHint })}
      accessibilityState={{ disabled, ...(selected === undefined ? {} : { selected }) }}
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
