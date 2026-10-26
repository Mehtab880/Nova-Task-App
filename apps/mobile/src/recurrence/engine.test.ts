import {
  generateOccurrences,
  nextOccurrenceAfter,
  nextOccurrenceAfterCompletion,
  normalizeRecurrencePattern,
} from './engine';
import { resolveLocalDateTime } from './time';
import type { RecurrencePattern } from './types';

function pattern(overrides: Partial<RecurrencePattern> = {}): RecurrencePattern {
  return {
    frequency: 'daily',
    interval: 1,
    weekdays: [],
    monthlyMode: 'day_of_month',
    monthDay: null,
    nth: null,
    weekday: null,
    startDate: '2026-01-01',
    startTime: '09:00',
    timezone: 'UTC',
    endDate: null,
    endAfterCount: null,
    repeatAfterCompletion: false,
    ...overrides,
  };
}

function dates(
  overrides: Partial<RecurrencePattern>,
  fromDate: string,
  toDate: string,
  maxOccurrences = 100,
): string[] {
  return generateOccurrences(pattern(overrides), {
    fromDate,
    toDate,
    maxOccurrences,
  }).map(occurrence => occurrence.date);
}

describe('recurrence engine', () => {
  it('generates every day for a daily rule', () => {
    expect(dates({}, '2026-01-01', '2026-01-05')).toEqual([
      '2026-01-01',
      '2026-01-02',
      '2026-01-03',
      '2026-01-04',
      '2026-01-05',
    ]);
  });

  it('honours a custom daily interval', () => {
    expect(dates({ interval: 3 }, '2026-01-01', '2026-01-10')).toEqual([
      '2026-01-01',
      '2026-01-04',
      '2026-01-07',
      '2026-01-10',
    ]);
  });

  it('generates weekdays only and skips the weekend', () => {
    expect(dates({ frequency: 'weekdays' }, '2026-01-01', '2026-01-07')).toEqual([
      '2026-01-01',
      '2026-01-02',
      '2026-01-05',
      '2026-01-06',
      '2026-01-07',
    ]);
  });

  it('generates one weekly weekday', () => {
    expect(
      dates(
        { frequency: 'weekly', startDate: '2026-01-07', weekdays: [3] },
        '2026-01-07',
        '2026-01-28',
      ),
    ).toEqual(['2026-01-07', '2026-01-14', '2026-01-21', '2026-01-28']);
  });

  it('generates multiple weekly weekdays', () => {
    expect(
      dates(
        {
          frequency: 'weekly',
          startDate: '2026-01-05',
          weekdays: [1, 3, 5],
        },
        '2026-01-05',
        '2026-01-14',
      ),
    ).toEqual(['2026-01-05', '2026-01-07', '2026-01-09', '2026-01-12', '2026-01-14']);
  });

  it('honours a two-week interval', () => {
    expect(
      dates(
        {
          frequency: 'weekly',
          interval: 2,
          startDate: '2026-01-05',
          weekdays: [1, 5],
        },
        '2026-01-05',
        '2026-01-20',
      ),
    ).toEqual(['2026-01-05', '2026-01-09', '2026-01-19']);
  });

  it('generates a monthly date and clamps short months', () => {
    expect(
      dates(
        {
          frequency: 'monthly',
          startDate: '2026-01-31',
          monthDay: 31,
        },
        '2026-01-01',
        '2026-04-30',
      ),
    ).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  });

  it('supports the last day of the month', () => {
    expect(
      dates(
        {
          frequency: 'monthly',
          startDate: '2026-01-01',
          monthDay: -1,
        },
        '2026-01-01',
        '2026-02-28',
      ),
    ).toEqual(['2026-01-31', '2026-02-28']);
  });

  it('generates the second Tuesday of each month', () => {
    expect(
      dates(
        {
          frequency: 'monthly',
          monthlyMode: 'nth_weekday',
          nth: 2,
          weekday: 2,
          startDate: '2026-01-01',
        },
        '2026-01-01',
        '2026-03-31',
      ),
    ).toEqual(['2026-01-13', '2026-02-10', '2026-03-10']);
  });

  it('generates the last Friday of each month', () => {
    expect(
      dates(
        {
          frequency: 'monthly',
          monthlyMode: 'nth_weekday',
          nth: -1,
          weekday: 5,
          startDate: '2026-01-01',
        },
        '2026-01-01',
        '2026-03-31',
      ),
    ).toEqual(['2026-01-30', '2026-02-27', '2026-03-27']);
  });

  it('clamps a leap-day yearly rule in non-leap years', () => {
    expect(
      dates(
        {
          frequency: 'yearly',
          startDate: '2024-02-29',
        },
        '2024-01-01',
        '2028-12-31',
      ),
    ).toEqual(['2024-02-29', '2025-02-28', '2026-02-28', '2027-02-28', '2028-02-29']);
  });

  it('stops at an inclusive end date', () => {
    expect(dates({ endDate: '2026-01-03' }, '2026-01-01', '2026-01-10')).toEqual([
      '2026-01-01',
      '2026-01-02',
      '2026-01-03',
    ]);
  });

  it('counts end-after from the series start, not the window start', () => {
    expect(dates({ endAfterCount: 3 }, '2026-01-02', '2026-01-10')).toEqual([
      '2026-01-02',
      '2026-01-03',
    ]);
  });

  it('limits the number of returned occurrences', () => {
    expect(dates({}, '2026-01-01', '2026-01-31', 4)).toHaveLength(4);
  });

  it('returns one next occurrence after a date', () => {
    expect(nextOccurrenceAfter(pattern({ interval: 2 }), '2026-01-04')).toEqual(
      expect.objectContaining({ date: '2026-01-05', sequence: 3 }),
    );
  });

  it('repeats after completion for a daily rule', () => {
    expect(
      nextOccurrenceAfterCompletion(pattern({ repeatAfterCompletion: true }), {
        completionDate: '2026-01-10',
        completedCount: 5,
      }),
    ).toEqual(expect.objectContaining({ date: '2026-01-11', sequence: 6 }));
  });

  it('repeats after completion for a weekly multiple-weekday rule', () => {
    expect(
      nextOccurrenceAfterCompletion(
        pattern({
          frequency: 'weekly',
          weekdays: [1, 3],
          startDate: '2026-01-05',
          repeatAfterCompletion: true,
        }),
        { completionDate: '2026-01-07', completedCount: 2 },
      ),
    ).toEqual(expect.objectContaining({ date: '2026-01-14', sequence: 3 }));
  });

  it('stops repeat-after-completion at the end-after count', () => {
    expect(
      nextOccurrenceAfterCompletion(pattern({ repeatAfterCompletion: true, endAfterCount: 5 }), {
        completionDate: '2026-01-10',
        completedCount: 5,
      }),
    ).toBeNull();
  });

  it('shifts a DST gap forward and marks it', () => {
    const [occurrence] = generateOccurrences(
      pattern({
        startDate: '2026-03-08',
        startTime: '02:30',
        timezone: 'America/New_York',
      }),
      { toDate: '2026-03-08', maxOccurrences: 1 },
    );
    expect(occurrence).toEqual(
      expect.objectContaining({ shifted: true, ambiguous: false, epochMillis: 1_772_955_000_000 }),
    );
  });

  it('chooses the earlier offset for an ambiguous DST time', () => {
    const [occurrence] = generateOccurrences(
      pattern({
        startDate: '2026-11-01',
        startTime: '01:30',
        timezone: 'America/New_York',
      }),
      { toDate: '2026-11-01', maxOccurrences: 1 },
    );
    expect(occurrence).toEqual(
      expect.objectContaining({ shifted: false, ambiguous: true, epochMillis: 1_793_511_000_000 }),
    );
    expect(resolveLocalDateTime('2026-11-01', '01:30', 'America/New_York').offsetMinutes).toBe(
      -240,
    );
  });

  it('resolves floating time in the rule time zone, not the device zone', () => {
    const tokyo = resolveLocalDateTime('2026-05-01', '09:00', 'Asia/Tokyo').millis;
    const newYork = resolveLocalDateTime('2026-05-01', '09:00', 'America/New_York').millis;
    expect(tokyo).toBeLessThan(newYork);
    expect(newYork - tokyo).toBe(13 * 60 * 60 * 1000);
  });

  it('rejects invalid intervals and calendar values', () => {
    expect(() => generateOccurrences(pattern({ interval: 0 }), { toDate: '2026-01-02' })).toThrow(
      'Recurrence interval',
    );
    expect(() =>
      generateOccurrences(pattern({ startDate: '2026-02-30' }), { toDate: '2026-03-01' }),
    ).toThrow('Invalid recurrence start date');
    expect(() =>
      generateOccurrences(pattern({ endDate: '2025-12-31' }), { toDate: '2026-01-02' }),
    ).toThrow('cannot be before');
    expect(() =>
      generateOccurrences(pattern({ timezone: 'Not/AZone' }), { toDate: '2026-01-02' }),
    ).toThrow('Invalid recurrence time zone');
  });

  it('normalizes weekly rules without explicit weekdays to the start weekday', () => {
    const normalized = normalizeRecurrencePattern(
      pattern({ frequency: 'weekly', startDate: '2026-01-07', weekdays: [] }),
    );
    expect(normalized.weekdays).toEqual([3]);
  });
});
