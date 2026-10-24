/**
 * The single source of truth for every colour in the application.
 * No component or screen may contain a colour literal.
 */
export interface ColorTokens {
  readonly brandPrimary: string;
  readonly brandPrimaryPressed: string;
  readonly brandPrimaryMuted: string;
  readonly onBrandPrimary: string;

  readonly surface: string;
  readonly surfaceRaised: string;
  readonly surfaceSunken: string;

  readonly text: string;
  readonly textMuted: string;
  readonly textInverse: string;

  readonly border: string;
  readonly borderStrong: string;

  readonly success: string;
  readonly successSurface: string;
  readonly onSuccess: string;

  readonly warning: string;
  readonly warningSurface: string;
  readonly onWarning: string;

  readonly error: string;
  readonly errorSurface: string;
  readonly onError: string;

  readonly disabled: string;
  readonly disabledSurface: string;
  readonly disabledText: string;

  readonly scrim: string;
  readonly focusRing: string;

  readonly tabBar: string;
  readonly tabBarActivePill: string;
  readonly tabBarActiveText: string;
  readonly tabBarInactiveText: string;
}

export const lightColors: ColorTokens = {
  brandPrimary: '#0F5557',
  brandPrimaryPressed: '#0A3F41',
  brandPrimaryMuted: '#D8EDEC',
  onBrandPrimary: '#FFFFFF',

  surface: '#FBFCFB',
  surfaceRaised: '#FFFFFF',
  surfaceSunken: '#EEF3F2',

  text: '#10211F',
  textMuted: '#51615E',
  textInverse: '#FFFFFF',

  border: '#CFDAD8',
  borderStrong: '#9FB0AD',

  success: '#166B3D',
  successSurface: '#E3F4EA',
  onSuccess: '#FFFFFF',

  warning: '#7A5300',
  warningSurface: '#FFF2D6',
  onWarning: '#FFFFFF',

  error: '#B3261E',
  errorSurface: '#FCE8E6',
  onError: '#FFFFFF',

  disabled: '#98A5A2',
  disabledSurface: '#E8EDEC',
  disabledText: '#5F6D6A',

  scrim: 'rgba(7, 16, 15, 0.55)',
  focusRing: '#0F5557',

  tabBar: '#FFFFFF',
  tabBarActivePill: '#D8EDEC',
  tabBarActiveText: '#0F5557',
  tabBarInactiveText: '#586865',
};

export const darkColors: ColorTokens = {
  brandPrimary: '#6FC3C4',
  brandPrimaryPressed: '#8FDADB',
  brandPrimaryMuted: '#123B3C',
  onBrandPrimary: '#052F30',

  surface: '#0A1110',
  surfaceRaised: '#121C1A',
  surfaceSunken: '#060C0B',

  text: '#E9F2F0',
  textMuted: '#A2B2AF',
  textInverse: '#0A1110',

  border: '#273633',
  borderStrong: '#3F514D',

  success: '#6FDD9F',
  successSurface: '#10301F',
  onSuccess: '#042113',

  warning: '#F5C95C',
  warningSurface: '#33280C',
  onWarning: '#241B03',

  error: '#FFB4AB',
  errorSurface: '#3A1512',
  onError: '#2B0705',

  disabled: '#5B6966',
  disabledSurface: '#1A2523',
  disabledText: '#8A9996',

  scrim: 'rgba(0, 0, 0, 0.65)',
  focusRing: '#6FC3C4',

  tabBar: '#0A1110',
  tabBarActivePill: '#123B3C',
  tabBarActiveText: '#8FDADB',
  tabBarInactiveText: '#92A29F',
};
