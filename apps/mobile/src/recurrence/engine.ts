import { AppError } from '@/core/errors/AppError';

import {
  addDays,
  civilToEpochDay,
  compareLocalDate,
  daysInMonth,
  daysBetween,
  epochDayToCivil,
  formatCivilDate,
  isoWeekday,
  isValidLocalDate,
  isValidLocalTime,
  localDateToEpochDay,
  maxLocalDate,
  minLocalDate,
  parseCivilDate,
  resolveLocalDateTime,
  startOfWeek,
} from './time';
import {
  MAX_RECURRENCE_SCAN_DAYS,
  MONTHLY_MODES,
  RECURRENCE_FREQUENCIES,
  type GeneratedOccurrence,
  type GenerateOptions,
  type RecurrencePattern,
} from './types';

function invalid(message: string, context?: Readonly<Record<string, unknown>>): never {
  throw new AppError({
    code: 'recurrence_rule_invalid',
    category: 'validation',
    message,
    ...(context === undefined ? {} : { context }),
  });
}

function isValidTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

function uniqueWeekdays(weekdays: readonly number[]): number[] {
  return [...new Set(weekdays)].sort((left, right) => left - right);
}

/**
 * Validates and fills deterministic defaults. Callers may persist the result
 * directly; the engine never mutates its input.
 */
export function normalizeRecurrencePattern(pattern: RecurrencePattern): RecurrencePattern {
  if (!RECURRENCE_FREQUENCIES.includes(pattern.frequency)) {
    invalid(`Unsupported recurrence frequency: ${String(pattern.frequency)}`);
  }
  if (!Number.isInteger(pattern.interval) || pattern.interval < 1 || pattern.interval > 999) {
    invalid('Recurrence interval must be an integer between 1 and 999');
  }
  if (!isValidLocalDate(pattern.startDate)) {
    invalid(`Invalid recurrence start date: ${pattern.startDate}`);
  }
  if (pattern.endDate !== null) {
    if (!isValidLocalDate(pattern.endDate)) {
      invalid(`Invalid recurrence end date: ${pattern.endDate}`);
    }
    if (compareLocalDate(pattern.endDate, pattern.startDate) < 0) {
      invalid('Recurrence end date cannot be before the start date');
    }
  }
  if (pattern.startTime !== null && !isValidLocalTime(pattern.startTime)) {
    invalid(`Invalid recurrence start time: ${pattern.startTime}`);
  }
  if (!isValidTimeZone(pattern.timezone)) {
    invalid(`Invalid recurrence time zone: ${pattern.timezone}`);
  }
  if (
    pattern.endAfterCount !== null &&
    (!Number.isInteger(pattern.endAfterCount) || pattern.endAfterCount < 1)
  ) {
    invalid('Recurrence end-after count must be at least 1');
  }
  if (!MONTHLY_MODES.includes(pattern.monthlyMode)) {
    invalid(`Unsupported monthly mode: ${String(pattern.monthlyMode)}`);
  }
  for (const weekday of pattern.weekdays) {
    if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
      invalid(`Invalid ISO weekday: ${String(weekday)}`);
    }
  }

  const start = parseCivilDate(pattern.startDate);
  if (start === null) invalid('Invalid recurrence start date');
  const startWeekday = isoWeekday(pattern.startDate);

  const normalizedWeekdays =
    pattern.frequency === 'weekly' && pattern.weekdays.length === 0
      ? [startWeekday]
      : uniqueWeekdays(pattern.weekdays);

  let monthDay = pattern.monthDay;
  if (pattern.monthlyMode === 'day_of_month') {
    const candidate = monthDay ?? start.day;
    if (candidate !== -1 && (candidate < 1 || candidate > 31)) {
      invalid('Monthly day must be between 1 and 31, or -1 for the last day');
    }
    monthDay = candidate;
  }

  let nth = pattern.nth;
  let weekday = pattern.weekday;
  if (pattern.monthlyMode === 'nth_weekday') {
    nth ??= 1;
    weekday ??= startWeekday;
    if (![1, 2, 3, 4, -1].includes(nth)) {
      invalid('Nth weekday must be 1-4 or -1 for the last weekday');
    }
    if (weekday < 1 || weekday > 7) invalid('Nth-weekday value must be 1-7');
  }

  return {
    frequency: pattern.frequency,
    interval: pattern.interval,
    weekdays: normalizedWeekdays,
    monthlyMode: pattern.monthlyMode,
    monthDay,
    nth,
    weekday,
    startDate: pattern.startDate,
    startTime: pattern.startTime,
    timezone: pattern.timezone,
    endDate: pattern.endDate,
    endAfterCount: pattern.endAfterCount,
    repeatAfterCompletion: pattern.repeatAfterCompletion,
  };
}

function monthIndex(date: string): number {
  const civil = parseCivilDate(date);
  if (civil === null) throw new RangeError(`Invalid date: ${date}`);
  return civil.year * 12 + (civil.month - 1);
}

function targetDayOfMonth(
  year: number,
  month: number,
  monthDay: number | null,
  fallback: number,
): number {
  const desired = monthDay ?? fallback;
  const length = daysInMonth(year, month);
  return desired === -1 ? length : Math.min(desired, length);
}

export function nthWeekdayOfMonth(
  year: number,
  month: number,
  nth: number,
  weekday: number,
): string | null {
  const length = daysInMonth(year, month);
  if (nth === -1) {
    const last = formatCivilDate({ year, month, day: length });
    const offset = (isoWeekday(last) - weekday + 7) % 7;
    return addDays(last, -offset);
  }
  const first = formatCivilDate({ year, month, day: 1 });
  const firstWeekday = isoWeekday(first);
  const day = 1 + ((weekday - firstWeekday + 7) % 7) + (nth - 1) * 7;
  return day > length ? null : formatCivilDate({ year, month, day });
}

function matchesRule(
  pattern: RecurrencePattern,
  date: string,
  startDate: string,
  startWeekday: number,
): boolean {
  const civil = parseCivilDate(date);
  const start = parseCivilDate(startDate);
  if (civil === null || start === null) return false;
  const dayOffset = civilToEpochDay(civil) - civilToEpochDay(start);
  if (dayOffset < 0) return false;

  const weekday = isoWeekday(date);
  const weekOffset = Math.floor(
    (localDateToEpochDay(startOfWeek(date)) - localDateToEpochDay(startOfWeek(startDate))) / 7,
  );

  switch (pattern.frequency) {
    case 'daily':
      return dayOffset % pattern.interval === 0;
    case 'weekdays':
      return weekday >= 1 && weekday <= 5 && weekOffset % pattern.interval === 0;
    case 'weekly': {
      const weekdays = pattern.weekdays.length === 0 ? [startWeekday] : pattern.weekdays;
      return weekdays.includes(weekday) && weekOffset % pattern.interval === 0;
    }
    case 'monthly': {
      const months = monthIndex(date) - monthIndex(startDate);
      if (months < 0 || months % pattern.interval !== 0) return false;
      if (pattern.monthlyMode === 'day_of_month') {
        return civil.day === targetDayOfMonth(civil.year, civil.month, pattern.monthDay, start.day);
      }
      const weekdayValue = pattern.weekday ?? startWeekday;
      const nth = pattern.nth ?? 1;
      const expected = nthWeekdayOfMonth(civil.year, civil.month, nth, weekdayValue);
      return expected === date;
    }
    case 'yearly': {
      const years = civil.year - start.year;
      if (years < 0 || years % pattern.interval !== 0) return false;
      if (civil.month !== start.month) return false;
      return civil.day === targetDayOfMonth(civil.year, civil.month, start.day, start.day);
    }
    default:
      return false;
  }
}

function makeOccurrence(
  pattern: RecurrencePattern,
  date: string,
  sequence: number,
): GeneratedOccurrence {
  if (pattern.startTime === null) {
    return {
      date,
      time: null,
      sequence,
      epochMillis: null,
      shifted: false,
      ambiguous: false,
    };
  }
  const instant = resolveLocalDateTime(date, pattern.startTime, pattern.timezone);
  return {
    date,
    time: pattern.startTime,
    sequence,
    epochMillis: instant.millis,
    shifted: instant.shifted,
    ambiguous: instant.ambiguous,
  };
}

/**
 * Generates occurrences in a local-date window.
 *
 * `endAfterCount` counts every occurrence from the series start, even those
 * before `fromDate`. Calendar-invalid monthly/yearly dates clamp to the last
 * day of the shorter month (Jan 31 -> Feb 28/29; Feb 29 -> Feb 28).
 */
export function generateOccurrences(
  rawPattern: RecurrencePattern,
  options: GenerateOptions,
): GeneratedOccurrence[] {
  const pattern = normalizeRecurrencePattern(rawPattern);
  if (!isValidLocalDate(options.toDate)) {
    invalid(`Invalid recurrence window end: ${options.toDate}`);
  }
  const maxOccurrences = options.maxOccurrences ?? Number.POSITIVE_INFINITY;
  if (maxOccurrences <= 0) return [];

  const fromDate = maxLocalDate(options.fromDate ?? pattern.startDate, pattern.startDate);
  const toDate = minLocalDate(
    options.toDate,
    pattern.endDate === null ? options.toDate : pattern.endDate,
  );
  if (compareLocalDate(fromDate, toDate) > 0) return [];

  const startCivil = parseCivilDate(pattern.startDate);
  const toCivil = parseCivilDate(toDate);
  if (startCivil === null || toCivil === null) return [];
  const startDay = civilToEpochDay(startCivil);
  const toDay = Math.min(civilToEpochDay(toCivil), startDay + MAX_RECURRENCE_SCAN_DAYS);
  const startWeekday = isoWeekday(pattern.startDate);
  const occurrences: GeneratedOccurrence[] = [];
  let sequence = 0;

  for (let day = startDay; day <= toDay; day += 1) {
    const date = formatCivilDate(epochDayToCivil(day));
    if (!matchesRule(pattern, date, pattern.startDate, startWeekday)) continue;

    sequence += 1;
    if (pattern.endAfterCount !== null && sequence > pattern.endAfterCount) break;
    if (compareLocalDate(date, fromDate) < 0) continue;

    occurrences.push(makeOccurrence(pattern, date, sequence));
    if (occurrences.length >= maxOccurrences) break;
  }

  return occurrences;
}

export interface CompletionAdvanceOptions {
  /** Local date on which the user completed the last occurrence. */
  readonly completionDate: string;
  /** Total occurrences already consumed, used for end-after checks. */
  readonly completedCount: number;
}

function nextWeekday(date: string): string {
  let candidate = addDays(date, 1);
  while (isoWeekday(candidate) > 5) {
    candidate = addDays(candidate, 1);
  }
  return candidate;
}

function shiftedMonthlyDate(
  date: string,
  months: number,
  pattern: RecurrencePattern,
): string | null {
  const civil = parseCivilDate(date);
  const start = parseCivilDate(pattern.startDate);
  if (civil === null || start === null) return null;
  const total = civil.year * 12 + (civil.month - 1) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  if (pattern.monthlyMode === 'nth_weekday') {
    return nthWeekdayOfMonth(
      year,
      month,
      pattern.nth ?? 1,
      pattern.weekday ?? isoWeekday(pattern.startDate),
    );
  }
  return formatCivilDate({
    year,
    month,
    day: targetDayOfMonth(year, month, pattern.monthDay, start.day),
  });
}

function shiftYears(date: string, years: number, pattern: RecurrencePattern): string | null {
  const civil = parseCivilDate(date);
  const start = parseCivilDate(pattern.startDate);
  if (civil === null || start === null) return null;
  const year = civil.year + years;
  const day = targetDayOfMonth(year, start.month, start.day, start.day);
  return formatCivilDate({ year, month: start.month, day });
}

/**
 * Advances one occurrence from the completion date. Used only when the series
 * is configured to repeat after completion instead of on a fixed calendar.
 */
export function nextOccurrenceAfterCompletion(
  rawPattern: RecurrencePattern,
  options: CompletionAdvanceOptions,
): GeneratedOccurrence | null {
  const pattern = normalizeRecurrencePattern(rawPattern);
  if (!pattern.repeatAfterCompletion) return null;
  if (pattern.endAfterCount !== null && options.completedCount >= pattern.endAfterCount) {
    return null;
  }

  let candidate: string | null;
  switch (pattern.frequency) {
    case 'daily':
      candidate = addDays(options.completionDate, pattern.interval);
      break;
    case 'weekdays': {
      candidate = nextWeekday(options.completionDate);
      if (pattern.interval > 1) {
        candidate = nextWeekday(addDays(candidate, (pattern.interval - 1) * 7));
      }
      break;
    }
    case 'weekly': {
      candidate = addDays(options.completionDate, pattern.interval * 7);
      const weekdays =
        pattern.weekdays.length === 0 ? [isoWeekday(pattern.startDate)] : pattern.weekdays;
      let guard = 0;
      while (!weekdays.includes(isoWeekday(candidate)) && guard < 7) {
        candidate = addDays(candidate, 1);
        guard += 1;
      }
      break;
    }
    case 'monthly':
      candidate = shiftedMonthlyDate(options.completionDate, pattern.interval, pattern);
      break;
    case 'yearly':
      candidate = shiftYears(options.completionDate, pattern.interval, pattern);
      break;
    default:
      candidate = null;
  }

  if (candidate === null) return null;
  if (
    compareLocalDate(candidate, options.completionDate) <= 0 ||
    compareLocalDate(candidate, pattern.startDate) < 0
  ) {
    return null;
  }
  if (pattern.endDate !== null && compareLocalDate(candidate, pattern.endDate) > 0) {
    return null;
  }
  return makeOccurrence(pattern, candidate, options.completedCount + 1);
}

export function nextOccurrenceAfter(
  pattern: RecurrencePattern,
  afterDate: string,
): GeneratedOccurrence | null {
  const fromDate = addDays(afterDate, 1);
  const toDate = addDays(fromDate, 366 * 5);
  return generateOccurrences(pattern, { fromDate, toDate, maxOccurrences: 1 }).at(0) ?? null;
}

/** Number of calendar days covered by a materialization window. */
export function windowEndDate(fromDate: string, days: number): string {
  return addDays(fromDate, Math.max(0, days));
}

export function recurrenceWindowDays(startDate: string, toDate: string): number {
  return Math.max(0, daysBetween(startDate, toDate));
}
