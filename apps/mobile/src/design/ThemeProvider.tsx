import {
  createContext,
  useContext,
  useMemo,
  type PropsWithChildren,
  type ReactElement,
} from 'react';
import { useColorScheme } from 'react-native';

import { getTheme, type Theme, type ThemeMode } from './theme';

const ThemeContext = createContext<Theme | null>(null);

export interface ThemeProviderProps {
  /** Forces a theme for tests/screenshots. Defaults to the OS setting. */
  readonly mode?: ThemeMode;
}

export function ThemeProvider({
  children,
  mode,
}: PropsWithChildren<ThemeProviderProps>): ReactElement {
  const systemScheme = useColorScheme();
  const resolvedMode: ThemeMode = mode ?? (systemScheme === 'dark' ? 'dark' : 'light');
  const value = useMemo(() => getTheme(resolvedMode), [resolvedMode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (theme === null) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return theme;
}
