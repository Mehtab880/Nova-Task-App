const REFERENCE = new Date('2026-01-15T17:00:00.000Z');

function normalize(value: string): string {
  return value.replace(/\u202F|\u00A0/g, ' ');
}

function formatInZone(timeZone: string): string {
  return normalize(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(REFERENCE),
  );
}

/**
 * Hermes must ship Intl with IANA time-zone support. Android uses the platform
 * ICU data, so this check is meaningful only on a device/emulator.
 */
export function verifyIntlTimeZones(): string {
  if (typeof Intl === 'undefined' || typeof Intl.DateTimeFormat !== 'function') {
    throw new Error('Intl.DateTimeFormat is unavailable');
  }

  const newYork = formatInZone('America/New_York');
  const tokyo = formatInZone('Asia/Tokyo');
  const utc = formatInZone('UTC');

  if (newYork !== '12:00 PM') {
    throw new Error(`America/New_York expected 12:00 PM, received ${newYork}`);
  }
  if (tokyo !== '2:00 AM') {
    throw new Error(`Asia/Tokyo expected 2:00 AM, received ${tokyo}`);
  }
  if (utc !== '5:00 PM') {
    throw new Error(`UTC expected 5:00 PM, received ${utc}`);
  }

  const zoneName =
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      timeZoneName: 'short',
    })
      .formatToParts(REFERENCE)
      .find(part => part.type === 'timeZoneName')?.value ?? 'unavailable';

  return `Intl resolved NY=${newYork}, Tokyo=${tokyo}, UTC=${utc}, name=${zoneName}`;
}
