/** Fixed layout dimensions from the approved M0 plan. */
export const sizes = {
  touchMinimum: 48,
  headerHeight: 56,
  tabBarHeight: 64,
  tabItemMinWidth: 48,
  tabPillHeight: 44,
  borderHairline: 1,
  iconSmall: 16,
  iconMedium: 24,
  iconLarge: 32,
} as const;

export type Sizes = typeof sizes;
