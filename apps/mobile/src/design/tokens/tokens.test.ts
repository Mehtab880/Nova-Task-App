import { darkTheme, getTheme, lightTheme } from '../theme';
import { minContrastRatio, relativeLuminance } from './contrast';
import { radiusScale, spacingScale } from './index';

describe('design tokens', () => {
  it('uses the approved brand primaries', () => {
    expect(lightTheme.colors.brandPrimary).toBe('#0F5557');
    expect(darkTheme.colors.brandPrimary).toBe('#6FC3C4');
  });

  it('exposes every required semantic colour token', () => {
    const required = [
      'surface',
      'surfaceRaised',
      'surfaceSunken',
      'text',
      'textMuted',
      'border',
      'success',
      'warning',
      'error',
      'disabled',
      'disabledSurface',
      'disabledText',
      'scrim',
    ] as const;

    for (const token of required) {
      expect(lightTheme.colors[token]).toBeTruthy();
      expect(darkTheme.colors[token]).toBeTruthy();
    }
  });

  it('uses the approved spacing and radius scales', () => {
    expect(spacingScale).toEqual([2, 4, 8, 12, 16, 24, 32]);
    expect(radiusScale).toEqual([8, 12, 16, 24, 9999]);
  });

  it('uses the approved fixed dimensions', () => {
    expect(lightTheme.sizes.touchMinimum).toBe(48);
    expect(lightTheme.sizes.headerHeight).toBe(56);
    expect(lightTheme.sizes.tabBarHeight).toBe(64);
  });

  it('maps typography to exact font file basenames', () => {
    expect(lightTheme.typography.body.fontFamily).toBe('PlusJakartaSans-Regular');
    expect(lightTheme.typography.bodyStrong.fontFamily).toBe('PlusJakartaSans-Medium');
    expect(lightTheme.typography.heading.fontFamily).toBe('PlusJakartaSans-SemiBold');
    expect(lightTheme.typography.display.fontFamily).toBe('PlusJakartaSans-Bold');
  });

  it('resolves themes by mode', () => {
    expect(getTheme('light')).toBe(lightTheme);
    expect(getTheme('dark')).toBe(darkTheme);
    expect(darkTheme.isDark).toBe(true);
    expect(lightTheme.isDark).toBe(false);
  });

  it('meets WCAG AA for primary text and brand buttons', () => {
    expect(
      minContrastRatio(lightTheme.colors.text, lightTheme.colors.surface),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      minContrastRatio(darkTheme.colors.text, darkTheme.colors.surface),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      minContrastRatio(lightTheme.colors.onBrandPrimary, lightTheme.colors.brandPrimary),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      minContrastRatio(darkTheme.colors.onBrandPrimary, darkTheme.colors.brandPrimary),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it('computes relative luminance in the expected range', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#FFFFFF')).toBe(1);
  });
});
