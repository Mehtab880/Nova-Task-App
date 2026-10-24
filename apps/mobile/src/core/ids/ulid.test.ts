import { createEntityId, createUlid, isUlid, parseEntityId, ulidToDate } from './ulid';

const ZERO_RANDOM = (length: number): Uint8Array => new Uint8Array(length);

describe('ULID utility', () => {
  it('matches a known ULID vector', () => {
    expect(createUlid({ timestamp: 1469918176385, random: ZERO_RANDOM })).toBe(
      '01ARYZ6S410000000000000000',
    );
  });

  it('round-trips the timestamp', () => {
    const ulid = createUlid({ timestamp: 1700000000000, random: ZERO_RANDOM });
    expect(ulidToDate(ulid).getTime()).toBe(1700000000000);
  });

  it('produces valid, unique-looking IDs by default', () => {
    const first = createUlid();
    const second = createUlid();
    expect(isUlid(first)).toBe(true);
    expect(isUlid(second)).toBe(true);
    expect(first).not.toBe(second);
  });

  it('rejects invalid input', () => {
    expect(isUlid('too-short')).toBe(false);
    expect(isUlid('01ARYZ6S41000000000000000I')).toBe(false);
    expect(() => ulidToDate('bad')).toThrow(TypeError);
    expect(() => createUlid({ timestamp: -1 })).toThrow(RangeError);
    expect(() => createUlid({ timestamp: 2 ** 49 })).toThrow(RangeError);
  });

  it('creates and parses namespaced entity IDs', () => {
    const id = createEntityId('task', { timestamp: 1469918176385, random: ZERO_RANDOM });
    expect(id).toBe('task_01ARYZ6S410000000000000000');
    expect(parseEntityId(id)).toEqual({
      prefix: 'task',
      ulid: '01ARYZ6S410000000000000000',
    });
    expect(parseEntityId('task_invalid')).toBeNull();
    expect(() => createEntityId('Task!')).toThrow(TypeError);
  });
});
