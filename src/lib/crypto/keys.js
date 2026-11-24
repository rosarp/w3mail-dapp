import { deriveEntropy } from '@parity/product-sdk-host';
import { nacl, sha256, utf8ToBytes } from '@parity/product-sdk-crypto';
import { isDesignPreview, isInHost } from '../host/detection.js';

/** @typedef {{ publicKey: Uint8Array, secretKey: Uint8Array }} KeyPair */

/** @type {Map<string, KeyPair>} */
const cache = new Map();

/**
 * A stable X25519 keypair for this user and product, derived by the host from
 * `context`. The host derives per wallet, not per account, so a context names the
 * account it is for: `<app>:x25519:v1:<h160>`. In design preview the pair is random.
 *
 * @param {string} context
 * @returns {Promise<KeyPair>}
 */
export async function deriveKeyPair(context) {
  const cached = cache.get(context);
  if (cached) return cached;
  if (isDesignPreview()) return remember(context, nacl.box.keyPair());
  if (!isInHost()) throw new Error('Keys need the Polkadot host');
  const result = await deriveEntropy(utf8ToBytes(context));
  if (result.ok === false) throw new Error(`The host could not derive a key: ${result.error.message}`);
  const seed = result.value.length === 32 ? result.value : sha256(result.value);
  return remember(context, nacl.box.keyPair.fromSecretKey(seed));
}

/**
 * @param {string} context
 * @param {KeyPair} pair
 */
function remember(context, pair) {
  cache.set(context, pair);
  return pair;
}

/** Forget every derived pair, e.g. when the account changes. */
export function clearKeyCache() {
  cache.clear();
}
