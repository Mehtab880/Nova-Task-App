import { DateTime } from 'luxon';

/** Floating local-date and local-time helpers. No instant is stored here. */

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^(\d{2}):(\d{2})$/;
const MS_PER_DAY = 86_400_000;

export interface CivilDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

export interface CivilTime {
  readonly hour: number;
  readonly minute: number;
}

export interface LocalInstant {
  /** Epoch milliseconds of the resolved instant. */
  readonly millis: number;
  /** True when the wall time does not exist (DST spring-forward gap). */
  readonly shifted: boolean;
  /** True when the wall time happens twice (DST fall-back overlap). */
  readonly ambiguous: boolean;
  /** Earlier offset is preferred for ambiguous times. */
  readonly offsetMinutes: number;
}

export function parseCivilDate(value: string): CivilDate | null {
  const match = DATE_PATTERN.exec(value);
  if (match === null) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1970 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

export function parseCivilTime(value: string): CivilTime | null {
  const match = TIME_PATTERN.exec(value);
  if (match === null) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

export function isValidLocalDate(value: string): boolean {
  return parseCivilDate(value) !== null;
}

export function isValidLocalTime(value: string): boolean {
  return parseCivilTime(value) !== null;
}

function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0');
}

export function formatCivilDate(date: CivilDate): string {
  return `${pad(date.year, 4)}-${pad(date.month)}-${pad(date.day)}`;
}

export function formatCivilTime(time: CivilTime): string {
  return `${pad(time.hour)}:${pad(time.minute)}`;
}

export function civilToEpochDay(date: CivilDate): number {
  return Math.floor(Date.UTC(date.year, date.month - 1, date.day) / MS_PER_DAY);
}

export function localDateToEpochDay(date: string): number {
  const civil = parseCivilDate(date);
  if (civil === null) throw new RangeError(`Invalid local date: ${date}`);
  return civilToEpochDay(civil);
}

export function epochDayToCivil(epochDay: number): CivilDate {
  const date = new Date(epochDay * MS_PER_DAY);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

export function addDays(date: string, days: number): string {
  const civil = parseCivilDate(date);
  if (civil === null) throw new RangeError(`Invalid local date: ${date}`);
  return formatCivilDate(epochDayToCivil(civilToEpochDay(civil) + Math.trunc(days)));
}

export function daysBetween(from: string, to: string): number {
  const start = parseCivilDate(from);
  const end = parseCivilDate(to);
  if (start === null || end === null) throw new RangeError('Invalid local date range');
  return civilToEpochDay(end) - civilToEpochDay(start);
}

export function compareLocalDate(left: string, right: string): number {
  return left === right ? 0 : left < right ? -1 : 1;
}

export function minLocalDate(left: string, right: string): string {
  return compareLocalDate(left, right) <= 0 ? left : right;
}

export function maxLocalDate(left: string, right: string): string {
  return compareLocalDate(left, right) >= 0 ? left : right;
}

/** ISO weekday: Monday = 1 ... Sunday = 7. */
export function isoWeekday(date: string): number {
  const civil = parseCivilDate(date);
  if (civil === null) throw new RangeError(`Invalid local date: ${date}`);
  const day = new Date(Date.UTC(civil.year, civil.month - 1, civil.day)).getUTCDay();
  return day === 0 ? 7 : day;
}

export function startOfWeek(date: string): string {
  return addDays(date, -(isoWeekday(date) - 1));
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addLocalMinutes(
  date: string,
  time: string,
  minutes: number,
): {
  readonly date: string;
  readonly time: string;
} {
  const civilDate = parseCivilDate(date);
  const civilTime = parseCivilTime(time);
  if (civilDate === null || civilTime === null) {
    throw new RangeError('Invalid local date or time');
  }
  const minuteOfDay = civilTime.hour * 60 + civilTime.minute + Math.trunc(minutes);
  const dayShift = Math.floor(minuteOfDay / 1_440);
  const normalized = ((minuteOfDay % 1_440) + 1_440) % 1_440;
  return {
    date: formatCivilDate(epochDayToCivil(civilToEpochDay(civilDate) + dayShift)),
    time: formatCivilTime({
      hour: Math.floor(normalized / 60),
      minute: normalized % 60,
    }),
  };
}

export function localDateInZone(nowMs: number, zone: string): string {
  const instant = DateTime.fromMillis(nowMs, { zone });
  if (!instant.isValid) throw new RangeError(`Invalid time zone: ${zone}`);
  return instant.toFormat('yyyy-LL-dd');
}

export function localTimeInZone(nowMs: number, zone: string): string {
  const instant = DateTime.fromMillis(nowMs, { zone });
  if (!instant.isValid) throw new RangeError(`Invalid time zone: ${zone}`);
  return instant.toFormat('HH:mm');
}

export function minutesOfDay(time: string): number {
  const parsed = parseCivilTime(time);
  if (parsed === null) throw new RangeError(`Invalid local time: ${time}`);
  return parsed.hour * 60 + parsed.minute;
}

/**
 * Resolves a floating wall time to an epoch instant.
 *
 * - DST gap: Luxon moves the wall time forward by the gap (02:30 -> 03:30).
 * - DST overlap: the earlier offset is selected, matching the approved policy.
 */
export function resolveLocalDateTime(date: string, time: string, zone: string): LocalInstant {
  const civilDate = parseCivilDate(date);
  const civilTime = parseCivilTime(time);
  if (civilDate === null || civilTime === null) {
    throw new RangeError(`Invalid local date/time: ${date} ${time}`);
  }
  const dateTime = DateTime.fromObject(
    {
      year: civilDate.year,
      month: civilDate.month,
      day: civilDate.day,
      hour: civilTime.hour,
      minute: civilTime.minute,
    },
    { zone },
  );
  if (!dateTime.isValid) {
    throw new RangeError(`Invalid local date/time for zone ${zone}: ${date} ${time}`);
  }
  const possible = dateTime.getPossibleOffsets();
  return {
    millis: dateTime.toMillis(),
    shifted: dateTime.hour !== civilTime.hour || dateTime.minute !== civilTime.minute,
    ambiguous: possible.length > 1,
    offsetMinutes: dateTime.offset,
  };
}

/** Resolves a local date-only value to end-of-day for ordering all-day tasks. */
export function resolveAllDay(date: string, zone: string): LocalInstant {
  return resolveLocalDateTime(date, '23:59', zone);
}

export function formatLocalDateLabel(date: string, locale = 'en-US'): string {
  const civil = parseCivilDate(date);
  if (civil === null) return date;
  const value = new Date(Date.UTC(civil.year, civil.month - 1, civil.day));
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(value);
}

export function formatLocalTimeLabel(time: string, locale = 'en-US'): string {
  const civil = parseCivilTime(time);
  if (civil === null) return time;
  const value = new Date(Date.UTC(2000, 0, 1, civil.hour, civil.minute));
  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'UTC',
  }).format(value);
}
