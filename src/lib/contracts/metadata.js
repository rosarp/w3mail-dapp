/**
 * Two chores every contract-backed app repeats: JSON in a `bytes` field, and reading
 * ABI results that arrive as either named structs or positional tuples.
 */

/** @param {string} _key @param {unknown} value */
const bigintReplacer = (_key, value) => (typeof value === 'bigint' ? value.toString() : value);

/**
 * Any JSON value as the `number[]` a `bytes` / `Vec<u8>` parameter expects. bigint-safe.
 *
 * @param {unknown} value
 * @returns {number[]}
 */
export function encodeJsonBytes(value) {
  return Array.from(new TextEncoder().encode(JSON.stringify(value, bigintReplacer)));
}

/**
 * @param {unknown} raw
 * @returns {Uint8Array}
 */
function toUint8(raw) {
  if (raw instanceof Uint8Array) return raw;
  if (Array.isArray(raw)) return Uint8Array.from(raw);
  const binary = /** @type {{ asBytes?: () => Uint8Array } | null} */ (raw);
  if (binary?.asBytes) return binary.asBytes();
  if (typeof raw === 'string') {
    const hex = raw.startsWith('0x') ? raw.slice(2) : raw;
    if (hex.length > 0 && hex.length % 2 === 0 && /^[0-9a-fA-F]*$/.test(hex)) {
      return Uint8Array.from(hex.match(/../g) ?? [], (b) => parseInt(b, 16));
    }
    return new TextEncoder().encode(raw);
  }
  return new Uint8Array();
}

/**
 * A `bytes` field back into JSON, or `fallback` when it is not JSON — a malformed
 * record must never crash a list.
 *
 * @template T
 * @param {unknown} raw
 * @param {T} fallback
 * @returns {T}
 */
export function decodeJsonBytes(raw, fallback) {
  try {
    const text = new TextDecoder().decode(toUint8(raw)).trim();
    return text ? JSON.parse(text) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * @param {unknown} value
 * @returns {bigint}  0n when not coercible.
 */
export function toBig(value) {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(Math.trunc(value));
  if (typeof value === 'string' && value.trim()) {
    try {
      return BigInt(value);
    } catch {
      return 0n;
    }
  }
  return 0n;
}

/**
 * @param {unknown} value
 * @returns {number}  0 when not coercible.
 */
export function toNum(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/**
 * A field of a decoded result by name, falling back to its tuple position:
 * `field(rec, 'owner', 0)`. A multi-output read keys unnamed outputs `_0`, `_1`, ….
 *
 * @template [T=unknown]
 * @param {unknown} rec
 * @param {string} name
 * @param {number} index
 * @returns {T | undefined}
 */
export function field(rec, name, index) {
  if (rec && typeof rec === 'object') {
    if (name in rec) return rec[name];
    if (index in rec) return rec[index];
    if (`_${index}` in rec) return rec[`_${index}`];
  }
  return undefined;
}
