import {
  darkColors,
  lightColors,
  radius,
  sizes,
  spacing,
  typography,
  type ColorTokens,
} from './tokens';

export type ThemeMode = 'light' | 'dark';

export interface Theme {
  readonly mode: ThemeMode;
  readonly isDark: boolean;
  readonly colors: ColorTokens;
  readonly spacing: typeof spacing;
  readonly radius: typeof radius;
  readonly sizes: typeof sizes;
  readonly typography: typeof typography;
}

export const lightTheme: Theme = {
  mode: 'light',
  isDark: false,
  colors: lightColors,
  spacing,
  radius,
  sizes,
  typography,
};

export const darkTheme: Theme = {
  mode: 'dark',
  isDark: true,
  colors: darkColors,
  spacing,
  radius,
  sizes,
  typography,
};

export function getTheme(mode: ThemeMode): Theme {
  return mode === 'dark' ? darkTheme : lightTheme;
}
