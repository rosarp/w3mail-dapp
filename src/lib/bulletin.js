import {
  calculateCid,
  CidCodec,
  cidToPreimageKey,
  CloudStorageLookupInterruptedError,
  CloudStorageLookupTimeoutError,
  HashAlgorithm,
  hashToCid,
  parseCid,
  queryBytes,
} from '@parity/product-sdk-cloud-storage';
import { getPreimageManager } from '@parity/product-sdk-host';
import { ensureBulletinAllowance } from './host/allowances.js';
import { isInHost } from './host/detection.js';

/**
 * The one way a generated app persists user files: the Polkadot Bulletin Chain,
 * referenced by CID. Never store a blob URL or a data URI — the first dies on reload,
 * the second bloats on-chain metadata.
 *
 *   const { url, cid } = await uploadFile(file);
 *
 * @typedef {object} BulletinUpload
 * @property {string} cid  CIDv1; store this.
 * @property {string} url  Gateway URL, usable as an `<img src>`.
 */

export const BULLETIN_GATEWAY = 'https://paseo-bulletin-next-ipfs.polkadot.io/ipfs/';

/**
 * The gateway URL for a bare CID or an `ipfs://` URI. URLs pass through.
 *
 * @param {string} cid
 */
export function bulletinUrl(cid) {
  if (!cid) return '';
  if (cid.startsWith('http')) return cid;
  return `${BULLETIN_GATEWAY}${cid.replace(/^ipfs:\/\//, '')}`;
}

/**
 * Store bytes on Bulletin through the host's preimage manager. The host signs and pays
 * after a one-time allowance.
 *
 * @param {Uint8Array} bytes
 * @returns {Promise<BulletinUpload>}
 */
export async function uploadBytes(bytes) {
  if (!isInHost()) {
    throw new Error('Open this app in the host to upload — files are stored on the Bulletin Chain.');
  }
  await ensureBulletinAllowance();
  const preimages = await getPreimageManager();
  if (!preimages) throw new Error('The host has no preimage store — files cannot be uploaded here.');
  const [cid] = await Promise.all([calculateCid(bytes).then((c) => c.toString()), preimages.submit(bytes)]);
  return { cid, url: bulletinUrl(cid) };
}

/**
 * @param {File} file
 * @returns {Promise<BulletinUpload>}
 */
export async function uploadFile(file) {
  return uploadBytes(new Uint8Array(await file.arrayBuffer()));
}

/**
 * @param {unknown} value  bigint-safe.
 * @returns {Promise<BulletinUpload>}
 */
export function uploadJson(value) {
  const json = JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
  return uploadBytes(new TextEncoder().encode(json));
}

/**
 * Read the bytes behind a CID through the host's preimage lookup. Chunked uploads are
 * reassembled.
 *
 * @param {string} cid
 * @param {{ timeoutMs?: number }} [options]
 * @returns {Promise<Uint8Array>}
 * @throws {Error} `This content is not available on Bulletin` when the lookup times out
 *   or is interrupted — content past its retention period is gone.
 */
export async function fetchBytes(cid, { timeoutMs = 30000 } = {}) {
  if (!isInHost()) throw new Error('Reading Bulletin needs the Polkadot host');
  const result = await queryBytes(cid.replace(/^ipfs:\/\//, ''), { lookupTimeoutMs: timeoutMs });
  if (result.ok === false) {
    const error = result.error;
    if (error instanceof CloudStorageLookupTimeoutError || error instanceof CloudStorageLookupInterruptedError) {
      throw new Error('This content is not available on Bulletin', { cause: error });
    }
    throw error;
  }
  return result.value;
}

/**
 * `fetchBytes`, parsed as JSON.
 *
 * @param {string} cid
 * @param {{ timeoutMs?: number }} [options]
 * @returns {Promise<unknown>}
 */
export async function fetchJson(cid, options) {
  return JSON.parse(new TextDecoder().decode(await fetchBytes(cid, options)));
}

/**
 * The 32-byte digest of a single-chunk Bulletin CID, as `0x` hex, for a contract that
 * stores CIDs as `bytes32`. `bytes32ToCid` turns it back.
 *
 * @param {string} cid
 * @returns {`0x${string}`}
 * @throws {Error} for a CID that is not raw blake2b-256: a bytes32 cannot carry its codec or hash.
 */
export function cidToBytes32(cid) {
  const bare = cid.replace(/^ipfs:\/\//, '');
  const parsed = parseCid(bare);
  if (parsed.multihash.code !== HashAlgorithm.Blake2b256 || parsed.code !== CidCodec.Raw) {
    throw new Error('Only raw blake2b-256 CIDs fit in bytes32');
  }
  return cidToPreimageKey(bare);
}

/**
 * The CID a `bytes32` from `cidToBytes32` came from.
 *
 * @param {`0x${string}`} hex
 * @returns {string}
 */
export function bytes32ToCid(hex) {
  return hashToCid(hex);
}
