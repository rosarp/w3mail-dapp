/**
 * Friendly, stable identities for addresses. A generated app never shows a raw address
 * to a person: render `displayName()` beside an `AddressAvatar`.
 *
 * @typedef {object} PseudonymWords
 * @property {string[]} [adjectives]
 * @property {string[]} [nouns]
 */

const ADJECTIVES = [
  'Amber', 'Quiet', 'Velvet', 'Neon', 'Verdant', 'Cobalt', 'Golden', 'Silent',
  'Lunar', 'Crimson', 'Misty', 'Bright', 'Hidden', 'Bold', 'Gentle', 'Swift',
];
const NOUNS = [
  'Fox', 'River', 'Harbor', 'Comet', 'Cedar', 'Falcon', 'Ember', 'Willow',
  'Atlas', 'Heron', 'Maple', 'Otter', 'Quartz', 'Raven', 'Sage', 'Wren',
];

/**
 * FNV-1a, 32-bit.
 *
 * @param {string} input
 */
export function hash32(input) {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * A deterministic "Adjective Noun" name for an address. Pass themed word lists to match
 * the app's voice.
 *
 * @param {string} address
 * @param {PseudonymWords} [words]
 */
export function pseudonym(address, words = {}) {
  if (!address) return 'Anonymous';
  const adj = words.adjectives?.length ? words.adjectives : ADJECTIVES;
  const noun = words.nouns?.length ? words.nouns : NOUNS;
  const h = hash32(address.toLowerCase());
  return `${adj[h % adj.length]} ${noun[(h >>> 8) % noun.length]}`;
}

/**
 * The name to show for an address: an explicit name, else "You" for the viewer, else a
 * pseudonym. Never the raw address.
 *
 * @param {string | null | undefined} address
 * @param {{ name?: string | null, self?: string | null, words?: PseudonymWords }} [opts]
 */
export function displayName(address, opts = {}) {
  if (opts.name?.trim()) return opts.name.trim();
  if (address && isSameAddress(address, opts.self)) return 'You';
  if (!address) return 'Anonymous';
  return pseudonym(address, opts.words);
}

/**
 * @param {string | null | undefined} a
 * @param {string | null | undefined} b
 */
export function isSameAddress(a, b) {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}
