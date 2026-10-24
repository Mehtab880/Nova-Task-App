import { DateTime } from 'luxon';

const REFERENCE_ISO = '2026-01-15T17:00:00.000Z';
const SUMMER_ISO = '2026-07-15T17:00:00.000Z';

/**
 * Luxon must resolve IANA zones through Intl, including DST. This is pure JS
 * and is covered by Jest on Node as well as by the on-device spike.
 */
export function verifyLuxonIanaTimeZones(): string {
  const reference = DateTime.fromISO(REFERENCE_ISO, { zone: 'utc' });
  if (!reference.isValid) {
    throw new Error(
      `Luxon could not parse the reference instant: ${reference.invalidReason ?? ''}`,
    );
  }

  const newYork = reference.setZone('America/New_York');
  const tokyo = reference.setZone('Asia/Tokyo');
  const newYorkSummer = DateTime.fromISO(SUMMER_ISO, { zone: 'utc' }).setZone('America/New_York');

  if (newYork.hour !== 12 || newYork.offset !== -300) {
    throw new Error(
      `Expected 12:00 EST (-300) in New York, received ${newYork.toISO() ?? 'invalid'} (${
        newYork.offset
      })`,
    );
  }

  if (tokyo.hour !== 2 || tokyo.offset !== 540) {
    throw new Error(
      `Expected 02:00 JST (+540) in Tokyo, received ${tokyo.toISO() ?? 'invalid'} (${tokyo.offset})`,
    );
  }

  if (newYorkSummer.offset !== -240) {
    throw new Error(`Expected EDT (-240) in July, received ${newYorkSummer.offset}`);
  }

  return `Luxon: NY=${newYork.toFormat('yyyy-LL-dd HH:mm ZZZ')}, Tokyo=${tokyo.toFormat(
    'yyyy-LL-dd HH:mm ZZZ',
  )}, NY summer offset=${newYorkSummer.offset}`;
}
