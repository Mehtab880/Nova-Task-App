import { render, screen } from '@testing-library/react-native';

import '@/i18n';

import { ErrorBoundary } from './ErrorBoundary';
import { ThemeProvider } from '@/design/ThemeProvider';

function ThrowingChild(): React.JSX.Element {
  throw new Error('render failure');
}

describe('ErrorBoundary', () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it('shows an accessible retry action instead of crashing', async () => {
    await render(
      <ThemeProvider mode="light">
        <ErrorBoundary>
          <ThrowingChild />
        </ErrorBoundary>
      </ThemeProvider>,
    );

    expect(await screen.findByText('Nova Task hit a problem')).toBeTruthy();
    const retry = screen.getByRole('button', { name: 'Try again' });
    expect(retry).toBeTruthy();
    expect(retry.props['accessibilityHint']).toBe('Resets the interface after an unexpected error');
  });
});
