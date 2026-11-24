import {
  concatBytes,
  deriveKey,
  nacl,
  utf8ToBytes,
  xchachaDecrypt,
  xchachaEncrypt,
} from '@parity/product-sdk-crypto';

const KEY_BYTES = 32;
const NONCE_BYTES = 24;

/**
 * Encrypt `plaintext` so only the holder of `recipientPublicKey`'s secret key can read
 * it: X25519 with a fresh ephemeral key, HKDF-SHA256 bound to both public keys and
 * `info`, then XChaCha20-Poly1305. The result is
 * `ephemeralPublicKey(32) ‖ nonce(24) ‖ ciphertext`.
 *
 * @param {Uint8Array} plaintext
 * @param {Uint8Array} recipientPublicKey
 * @param {string} info  What the message is for, e.g. `w3mail:mail:v1`; `open` needs the same.
 * @returns {Uint8Array}
 */
export function seal(plaintext, recipientPublicKey, info) {
  const ephemeral = nacl.box.keyPair();
  const key = messageKey(ephemeral.secretKey, recipientPublicKey, ephemeral.publicKey, recipientPublicKey, info);
  const { ciphertext, nonce } = xchachaEncrypt(plaintext, key);
  return concatBytes(ephemeral.publicKey, nonce, ciphertext);
}

/**
 * Decrypt what `seal` produced for this keypair.
 *
 * @param {Uint8Array} sealed
 * @param {Uint8Array} secretKey
 * @param {string} info
 * @returns {Uint8Array}
 * @throws {Error} `This message cannot be decrypted` for the wrong key, `info` or a tampered message.
 */
export function open(sealed, secretKey, info) {
  if (sealed.length < KEY_BYTES + NONCE_BYTES + 16) throw undecryptable();
  const ephemeralPublicKey = sealed.subarray(0, KEY_BYTES);
  const nonce = sealed.subarray(KEY_BYTES, KEY_BYTES + NONCE_BYTES);
  const ciphertext = sealed.subarray(KEY_BYTES + NONCE_BYTES);
  const ownPublicKey = nacl.box.keyPair.fromSecretKey(secretKey).publicKey;
  const key = messageKey(secretKey, ephemeralPublicKey, ephemeralPublicKey, ownPublicKey, info);
  try {
    return xchachaDecrypt(ciphertext, key, nonce);
  } catch (cause) {
    throw undecryptable(cause);
  }
}

/**
 * `seal` for a JSON value; bigints are written as strings.
 *
 * @param {unknown} value
 * @param {Uint8Array} recipientPublicKey
 * @param {string} info
 */
export function sealJson(value, recipientPublicKey, info) {
  const json = JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
  return seal(utf8ToBytes(json), recipientPublicKey, info);
}

/**
 * `open` for what `sealJson` produced.
 *
 * @param {Uint8Array} sealed
 * @param {Uint8Array} secretKey
 * @param {string} info
 * @returns {unknown}
 */
export function openJson(sealed, secretKey, info) {
  return JSON.parse(new TextDecoder().decode(open(sealed, secretKey, info)));
}

/**
 * @param {Uint8Array} secretKey
 * @param {Uint8Array} peerPublicKey
 * @param {Uint8Array} ephemeralPublicKey
 * @param {Uint8Array} recipientPublicKey
 * @param {string} info
 */
function messageKey(secretKey, peerPublicKey, ephemeralPublicKey, recipientPublicKey, info) {
  const shared = nacl.scalarMult(secretKey, peerPublicKey);
  return deriveKey(shared, concatBytes(ephemeralPublicKey, recipientPublicKey), info);
}

/** @param {unknown} [cause] */
function undecryptable(cause) {
  return new Error('This message cannot be decrypted', { cause });
}
