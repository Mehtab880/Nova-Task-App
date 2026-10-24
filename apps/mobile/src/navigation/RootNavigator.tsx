import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
  type Theme as NavigationTheme,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useMemo } from 'react';

import { environment } from '@/core/env/environment';
import { useTheme } from '@/design/ThemeProvider';
import { ReminderDiagnosticsScreen } from '@/reminders/screens/ReminderDiagnosticsScreen';
import { ReminderTestScreen } from '@/reminders/screens/ReminderTestScreen';

import { TabNavigator } from './TabNavigator';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator(): React.JSX.Element {
  const theme = useTheme();

  const navigationTheme = useMemo<NavigationTheme>(() => {
    const base = theme.isDark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      dark: theme.isDark,
      colors: {
        ...base.colors,
        primary: theme.colors.brandPrimary,
        background: theme.colors.surface,
        card: theme.colors.surfaceRaised,
        text: theme.colors.text,
        border: theme.colors.border,
        notification: theme.colors.error,
      },
    };
  }, [theme]);

  return (
    <NavigationContainer theme={navigationTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Main" component={TabNavigator} />
        {environment.m4Enabled ? (
          <>
            <Stack.Screen name="ReminderTest" component={ReminderTestScreen} />
            <Stack.Screen name="ReminderDiagnostics" component={ReminderDiagnosticsScreen} />
          </>
        ) : null}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
