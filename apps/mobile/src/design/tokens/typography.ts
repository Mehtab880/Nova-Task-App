/**
 * Typography tokens map to the exact Android font file basenames.
 * Files live in apps/mobile/assets/fonts and are copied into the APK by Gradle.
 */
export const fontFamilies = {
  regular: 'PlusJakartaSans-Regular',
  medium: 'PlusJakartaSans-Medium',
  semiBold: 'PlusJakartaSans-SemiBold',
  bold: 'PlusJakartaSans-Bold',
  fallback: 'Roboto',
} as const;

export type FontFamilyToken = keyof typeof fontFamilies;

export interface TypographyToken {
  readonly fontFamily: string;
  /** Custom weights are separate files, so no synthetic weight is applied. */
  readonly fontWeight: 'normal';
  readonly fontSize: number;
  readonly lineHeight: number;
  readonly letterSpacing?: number;
}

export const typography = {
  display: {
    fontFamily: fontFamilies.bold,
    fontWeight: 'normal',
    fontSize: 32,
    lineHeight: 40,
  },
  title: {
    fontFamily: fontFamilies.bold,
    fontWeight: 'normal',
    fontSize: 28,
    lineHeight: 36,
  },
  heading: {
    fontFamily: fontFamilies.semiBold,
    fontWeight: 'normal',
    fontSize: 24,
    lineHeight: 32,
  },
  subheading: {
    fontFamily: fontFamilies.semiBold,
    fontWeight: 'normal',
    fontSize: 20,
    lineHeight: 28,
  },
  body: {
    fontFamily: fontFamilies.regular,
    fontWeight: 'normal',
    fontSize: 16,
    lineHeight: 24,
  },
  bodyStrong: {
    fontFamily: fontFamilies.medium,
    fontWeight: 'normal',
    fontSize: 16,
    lineHeight: 24,
  },
  bodySmall: {
    fontFamily: fontFamilies.regular,
    fontWeight: 'normal',
    fontSize: 14,
    lineHeight: 20,
  },
  label: {
    fontFamily: fontFamilies.medium,
    fontWeight: 'normal',
    fontSize: 14,
    lineHeight: 20,
  },
  caption: {
    fontFamily: fontFamilies.regular,
    fontWeight: 'normal',
    fontSize: 12,
    lineHeight: 16,
  },
  button: {
    fontFamily: fontFamilies.semiBold,
    fontWeight: 'normal',
    fontSize: 16,
    lineHeight: 24,
  },
  tabLabel: {
    fontFamily: fontFamilies.medium,
    fontWeight: 'normal',
    fontSize: 12,
    lineHeight: 16,
  },
} as const satisfies Record<string, TypographyToken>;

export type Typography = typeof typography;
export type TypographyVariant = keyof Typography;

/** System accessibility scaling is enabled and capped at 2.0x. */
export const fontScaling = {
  allowFontScaling: true,
  maxFontSizeMultiplier: 2.0,
} as const;
