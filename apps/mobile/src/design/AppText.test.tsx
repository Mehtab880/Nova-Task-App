import { render, screen } from '@testing-library/react-native';

import { AppText } from './AppText';
import { ThemeProvider } from './ThemeProvider';
import { darkTheme } from './theme';
import { fontScaling } from './tokens';

describe('AppText', () => {
  it('enables font scaling and caps it at 2.0x', async () => {
    await render(
      <ThemeProvider mode="light">
        <AppText>Hello</AppText>
      </ThemeProvider>,
    );

    const text = screen.getByText('Hello');
    expect(text.props['allowFontScaling']).toBe(true);
    expect(text.props['maxFontSizeMultiplier']).toBe(fontScaling.maxFontSizeMultiplier);
  });

  it('uses the dark theme text token in dark mode', async () => {
    await render(
      <ThemeProvider mode="dark">
        <AppText testID="themed">Hello</AppText>
      </ThemeProvider>,
    );

    expect(screen.getByTestId('themed').props['style']).toEqual(
      expect.arrayContaining([expect.objectContaining({ color: darkTheme.colors.text })]),
    );
  });

  it('allows an explicit semantic colour', async () => {
    await render(
      <ThemeProvider mode="light">
        <AppText color="error">Error</AppText>
      </ThemeProvider>,
    );

    expect(screen.getByText('Error')).toBeTruthy();
  });
});
