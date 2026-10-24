/** Approved corner radius scale. */
export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

export const radiusScale = [8, 12, 16, 24, 9999] as const;

export type Radius = typeof radius;
export type RadiusToken = keyof Radius;
