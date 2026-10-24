const ULID_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const ULID_ALPHABET_SET = new Set(ULID_ALPHABET.split(''));
const TIME_LENGTH = 10;
const RANDOM_BYTES = 10;
const MAX_TIMESTAMP = 281_474_976_710_655; // 2^48 - 1

export type RandomBytes = (length: number) => Uint8Array;

export interface UlidOptions {
  readonly clock?: { now(): Date };
  readonly random?: RandomBytes;
  readonly timestamp?: number;
}

interface RandomCrypto {
  getRandomValues?<T extends ArrayBufferView>(array: T): T;
}

function getCrypto(): RandomCrypto | undefined {
  return (globalThis as { crypto?: RandomCrypto }).crypto;
}

/**
 * Prefer platform CSPRNG when available. Hermes does not expose Web Crypto by
 * default, so fall back to Math.random. IDs are non-security identifiers; the
 * fallback is documented in docs/adr/0001-stack.md.
 */
export const defaultRandomBytes: RandomBytes = length => {
  const bytes = new Uint8Array(length);
  const crypto = getCrypto();

  if (crypto?.getRandomValues) {
    crypto.getRandomValues(bytes);
    return bytes;
  }

  for (let index = 0; index < length; index += 1) {
    bytes[index] = Math.floor(Math.random() * 256);
  }

  return bytes;
};

function encodeTime(timestamp: number): string {
  if (!Number.isInteger(timestamp) || timestamp < 0 || timestamp > MAX_TIMESTAMP) {
    throw new RangeError(`ULID timestamp out of range: ${timestamp}`);
  }

  let remaining = timestamp;
  let output = '';

  for (let index = 0; index < TIME_LENGTH; index += 1) {
    const symbol = ULID_ALPHABET.charAt(remaining % 32);
    output = `${symbol}${output}`;
    remaining = Math.floor(remaining / 32);
  }

  return output;
}

function encodeRandom(bytes: Uint8Array): string {
  if (bytes.length < RANDOM_BYTES) {
    throw new RangeError(`ULID requires ${RANDOM_BYTES} random bytes, received ${bytes.length}`);
  }

  let buffer = 0;
  let bits = 0;
  let output = '';

  for (let index = 0; index < RANDOM_BYTES; index += 1) {
    buffer = (buffer << 8) | (bytes[index] ?? 0);
    bits += 8;

    while (bits >= 5) {
      bits -= 5;
      output += ULID_ALPHABET.charAt((buffer >> bits) & 31);
    }

    if (bits > 0) {
      buffer &= (1 << bits) - 1;
    } else {
      buffer = 0;
    }
  }

  return output;
}

/** Generate a 26-character Crockford base32 ULID. */
export function createUlid(options: UlidOptions = {}): string {
  const timestamp =
    options.timestamp ?? (options.clock ?? { now: () => new Date() }).now().getTime();
  const random = options.random ?? defaultRandomBytes;

  if (!Number.isFinite(timestamp) || timestamp < 0) {
    throw new RangeError(`Invalid ULID time: ${String(timestamp)}`);
  }

  return `${encodeTime(Math.floor(timestamp))}${encodeRandom(random(RANDOM_BYTES))}`;
}

export function isUlid(value: string): boolean {
  return /^[0-9A-HJKMNP-TV-Z]{26}$/.test(value);
}

export function ulidToDate(ulid: string): Date {
  if (!isUlid(ulid)) {
    throw new TypeError('Invalid ULID');
  }

  let timestamp = 0;
  for (let index = 0; index < TIME_LENGTH; index += 1) {
    const symbol = ulid[index];
    if (symbol === undefined) {
      throw new TypeError('Invalid ULID');
    }
    const value = ULID_ALPHABET.indexOf(symbol);
    if (!ULID_ALPHABET_SET.has(symbol) || value < 0) {
      throw new TypeError('Invalid ULID');
    }
    timestamp = timestamp * 32 + value;
  }

  return new Date(timestamp);
}

/** Entity IDs are namespaced ULIDs, e.g. `task_01H...`. */
export function createEntityId(prefix: string, options: UlidOptions = {}): string {
  const normalized = prefix.trim().toLowerCase();
  if (!/^[a-z][a-z0-9_]*$/.test(normalized)) {
    throw new TypeError(`Invalid entity prefix: ${prefix}`);
  }
  return `${normalized}_${createUlid(options)}`;
}

export function parseEntityId(value: string): { prefix: string; ulid: string } | null {
  const separator = value.indexOf('_');
  if (separator <= 0) {
    return null;
  }

  const prefix = value.slice(0, separator);
  const ulid = value.slice(separator + 1);
  return isUlid(ulid) ? { prefix, ulid } : null;
}
