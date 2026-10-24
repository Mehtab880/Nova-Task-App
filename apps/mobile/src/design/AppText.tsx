import { Text, type TextProps } from 'react-native';

import { useTheme } from './ThemeProvider';
import { fontScaling, type ColorTokens, type TypographyVariant } from './tokens';

export interface AppTextProps extends TextProps {
  readonly variant?: TypographyVariant;
  readonly color?: keyof ColorTokens;
}

/**
 * All text goes through AppText so accessibility scaling and typography
 * tokens cannot be accidentally bypassed.
 */
export function AppText({
  variant = 'body',
  color = 'text',
  style,
  allowFontScaling,
  maxFontSizeMultiplier,
  ...rest
}: AppTextProps): React.JSX.Element {
  const theme = useTheme();

  return (
    <Text
      {...rest}
      allowFontScaling={allowFontScaling ?? fontScaling.allowFontScaling}
      maxFontSizeMultiplier={maxFontSizeMultiplier ?? fontScaling.maxFontSizeMultiplier}
      style={[theme.typography[variant], { color: theme.colors[color] }, style]}
    />
  );
}
