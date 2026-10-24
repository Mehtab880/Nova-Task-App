const NARROW_NO_BREAK_SPACE = /\u202F/g;
const NO_BREAK_SPACE = /\u00A0/g;

export interface FormatTimeOptions {
  /** IANA time zone, e.g. `America/New_York`. Defaults to the device zone. */
  readonly timeZone?: string;
  /** BCP-47 locale. Defaults to `en-US` so the 12-hour contract is stable. */
  readonly locale?: string;
}

/**
 * Format an instant as 12-hour local time, e.g. `9:05 AM`.
 * Uses Intl so DST and IANA zones are handled by the platform.
 */
export function formatTime12Hour(date: Date, options: FormatTimeOptions = {}): string {
  if (Number.isNaN(date.getTime())) {
    throw new RangeError('Cannot format an invalid Date');
  }

  const formatter = new Intl.DateTimeFormat(options.locale ?? 'en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    ...(options.timeZone === undefined ? {} : { timeZone: options.timeZone }),
  });

  return formatter.format(date).replace(NARROW_NO_BREAK_SPACE, ' ').replace(NO_BREAK_SPACE, ' ');
}
