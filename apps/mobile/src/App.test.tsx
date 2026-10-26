import { render, screen, userEvent } from '@testing-library/react-native';

import App from './App';

describe('App shell', () => {
  it('renders four accessible tabs with Today selected', async () => {
    await render(<App />);

    for (const label of ['Today', 'Inbox', 'Calendar', 'Nova']) {
      expect(await screen.findByRole('tab', { name: label })).toBeTruthy();
    }

    const today = screen.getByRole('tab', { name: 'Today' });
    expect(today.props['accessibilityState']).toEqual({ selected: true });
  });

  it('navigates between tabs', async () => {
    const user = userEvent.setup();
    await render(<App />);

    await user.press(screen.getByRole('tab', { name: 'Calendar' }));

    expect(await screen.findByText('Upcoming')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Calendar' }).props['accessibilityState']).toEqual({
      selected: true,
    });
  });
});
