import type { NavigatorScreenParams } from '@react-navigation/native';

export type MainTabParamList = {
  Today: undefined;
  Inbox: undefined;
  Calendar: undefined;
  Nova: undefined;
};

export type RootStackParamList = {
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
  ReminderTest: undefined;
  ReminderDiagnostics: undefined;
};
