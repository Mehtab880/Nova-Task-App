import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/design/AppText';
import { useTheme } from '@/design/ThemeProvider';

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

/**
 * Accessible custom tab bar: 48dp+ targets, active pill, safe-area aware.
 * No feature logic lives here.
 */
export function NovaTabBar({
  state,
  descriptors,
  navigation,
}: BottomTabBarProps): React.JSX.Element {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={t('tabs.accessibilityLabel')}
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.tabBar,
          borderTopColor: theme.colors.border,
          borderTopWidth: theme.sizes.borderHairline,
          minHeight: theme.sizes.tabBarHeight + insets.bottom,
          paddingTop: theme.spacing.sm,
          paddingBottom: theme.spacing.sm + insets.bottom,
          paddingHorizontal: theme.spacing.sm,
        },
      ]}
    >
      {state.routes.map((route, index) => {
        const descriptor = descriptors[route.key];
        if (descriptor === undefined) {
          return null;
        }

        const { options } = descriptor;
        const isFocused = state.index === index;
        const label =
          options.tabBarAccessibilityLabel ??
          (typeof options.title === 'string' ? options.title : route.name);

        const onPress = (): void => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });

          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
          }
        };

        const onLongPress = (): void => {
          navigation.emit({ type: 'tabLongPress', target: route.key });
        };

        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityHint={t('tabs.accessibilityHint')}
            accessibilityState={{ selected: isFocused }}
            testID={`tab-${route.name.toLowerCase()}`}
            onPress={onPress}
            onLongPress={onLongPress}
            style={({ pressed }) => [
              styles.item,
              {
                minHeight: theme.sizes.touchMinimum,
                minWidth: theme.sizes.tabItemMinWidth,
                height: theme.sizes.touchMinimum,
                borderRadius: theme.radius.full,
                paddingHorizontal: theme.spacing.xs,
                backgroundColor: isFocused
                  ? theme.colors.tabBarActivePill
                  : pressed
                    ? theme.colors.surfaceSunken
                    : undefined,
              },
            ]}
          >
            <AppText
              variant="tabLabel"
              color={isFocused ? 'tabBarActiveText' : 'tabBarInactiveText'}
              numberOfLines={1}
              style={{ textAlign: 'center' }}
            >
              {label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}
