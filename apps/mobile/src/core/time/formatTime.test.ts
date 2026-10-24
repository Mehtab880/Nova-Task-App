import { formatTime12Hour } from './formatTime';

describe('formatTime12Hour', () => {
  it('formats afternoon times in 12-hour form', () => {
    expect(formatTime12Hour(new Date('2026-01-01T14:05:00.000Z'), { timeZone: 'UTC' })).toBe(
      '2:05 PM',
    );
  });

  it('formats midnight and noon correctly', () => {
    expect(formatTime12Hour(new Date('2026-01-01T00:00:00.000Z'), { timeZone: 'UTC' })).toBe(
      '12:00 AM',
    );
    expect(formatTime12Hour(new Date('2026-01-01T12:00:00.000Z'), { timeZone: 'UTC' })).toBe(
      '12:00 PM',
    );
  });

  it('honours IANA time zones', () => {
    const instant = new Date('2026-01-15T17:00:00.000Z');
    expect(formatTime12Hour(instant, { timeZone: 'America/New_York' })).toBe('12:00 PM');
    expect(formatTime12Hour(instant, { timeZone: 'Asia/Tokyo' })).toBe('2:00 AM');
  });

  it('does not emit narrow no-break spaces', () => {
    const value = formatTime12Hour(new Date('2026-01-01T09:05:00.000Z'), { timeZone: 'UTC' });
    expect(value).toBe('9:05 AM');
    expect(value).not.toMatch(/\u202F|\u00A0/);
  });

  it('rejects invalid dates', () => {
    expect(() => formatTime12Hour(new Date(Number.NaN))).toThrow(RangeError);
  });
});
