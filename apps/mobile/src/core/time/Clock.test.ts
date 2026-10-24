import { createFixedClock, systemClock } from './Clock';

describe('Clock', () => {
  it('creates a fixed clock that returns independent Date instances', () => {
    const clock = createFixedClock('2026-10-24T12:34:56.000Z');
    const first = clock.now();
    first.setUTCFullYear(1999);

    expect(clock.now().toISOString()).toBe('2026-10-24T12:34:56.000Z');
  });

  it('accepts a Date instance', () => {
    const instant = new Date('2026-01-01T00:00:00.000Z');
    expect(createFixedClock(instant).now().getTime()).toBe(instant.getTime());
  });

  it('rejects invalid instants', () => {
    expect(() => createFixedClock('not-a-date')).toThrow(RangeError);
  });

  it('provides a system clock', () => {
    expect(systemClock.now()).toBeInstanceOf(Date);
  });
});
