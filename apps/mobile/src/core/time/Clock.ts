/**
 * Injected time source. Never call `new Date()` in domain or UI code; tests
 * and future sync logic must be able to control time.
 */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = Object.freeze({
  now: () => new Date(),
});

/** Immutable clock for tests and deterministic screenshots. */
export function createFixedClock(instant: Date | string): Clock {
  const date = typeof instant === 'string' ? new Date(instant) : new Date(instant.getTime());

  if (Number.isNaN(date.getTime())) {
    throw new RangeError(`Invalid fixed-clock instant: ${String(instant)}`);
  }

  const timestamp = date.getTime();
  return Object.freeze({
    now: () => new Date(timestamp),
  });
}
