import { verifyIntlTimeZones } from './intl-check';
import { verifyLuxonIanaTimeZones } from './luxon-check';

/**
 * These pure time-zone checks run in Jest/Node and on-device via the M0 spike.
 * On-device they additionally exercise Hermes Intl.
 */
describe('M0 time-zone checks', () => {
  it('resolves IANA zones and DST through Luxon', () => {
    expect(verifyLuxonIanaTimeZones()).toContain('NY=2026-01-15 12:00');
    expect(verifyLuxonIanaTimeZones()).toContain('Tokyo=2026-01-16 02:00');
    expect(verifyLuxonIanaTimeZones()).toContain('summer offset=-240');
  });

  it('resolves IANA zones through Intl', () => {
    const details = verifyIntlTimeZones();
    expect(details).toContain('NY=12:00 PM');
    expect(details).toContain('Tokyo=2:00 AM');
    expect(details).toContain('UTC=5:00 PM');
  });
});
