import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useTranslation } from 'react-i18next';

import { NovaTabBar } from './NovaTabBar';
import { CalendarScreen } from './screens/CalendarScreen';
import { InboxScreen } from './screens/InboxScreen';
import { NovaScreen } from './screens/NovaScreen';
import { TodayScreen } from './screens/TodayScreen';
import type { MainTabParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();

export function TabNavigator(): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <Tab.Navigator
      tabBar={props => <NovaTabBar {...props} />}
      screenOptions={{ headerShown: false, lazy: true }}
    >
      <Tab.Screen
        name="Today"
        component={TodayScreen}
        options={{
          title: t('tabs.today'),
          tabBarAccessibilityLabel: t('tabs.today'),
        }}
      />
      <Tab.Screen
        name="Inbox"
        component={InboxScreen}
        options={{
          title: t('tabs.inbox'),
          tabBarAccessibilityLabel: t('tabs.inbox'),
        }}
      />
      <Tab.Screen
        name="Calendar"
        component={CalendarScreen}
        options={{
          title: t('tabs.calendar'),
          tabBarAccessibilityLabel: t('tabs.calendar'),
        }}
      />
      <Tab.Screen
        name="Nova"
        component={NovaScreen}
        options={{
          title: t('tabs.nova'),
          tabBarAccessibilityLabel: t('tabs.nova'),
        }}
      />
    </Tab.Navigator>
  );
}
