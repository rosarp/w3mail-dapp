import { openCollection } from './store.js';
import { walletStore } from './stores.js';
import { toH160 } from './contracts.js';
import { sleep, truncateAddress } from './format.js';

/**
 * The person's mailbox on this device: per-account collections, so two accounts in one
 * host never see each other's mail.
 *
 * @typedef {'inbox' | 'sent' | 'trash'} Folder
 *
 * @typedef {object} MailRecord
 * @property {string} key  Collection key: the `msgId`, or `<msgId>:sent` for the sent copy of a note to self.
 * @property {string} msgId
 * @property {Folder} folder
 * @property {'inbox' | 'sent'} [previousFolder]  Where a trashed message is restored to.
 * @property {string} from  H160.
 * @property {string} to  H160.
 * @property {string} subject
 * @property {string} body
 * @property {string} cid
 * @property {number} timestamp  Milliseconds.
 * @property {boolean} read
 * @property {boolean} expired
 * @property {boolean} deleted
 *
 * @typedef {object} Draft
 * @property {string} id
 * @property {string} to
 * @property {string} subject
 * @property {string} body
 * @property {number} updatedAt
 *
 * @typedef {object} Contact
 * @property {string} id
 * @property {string} name
 * @property {string} address  H160.
 *
 * @typedef {object} MailboxState
 * @property {string} [publicKey]  Hex.
 * @property {number} [registeredAt]
 * @property {number} inboxSynced  Inbox entries on chain already processed.
 * @property {number} [lastSyncedAt]
 */

/**
 * The account's collections.
 *
 * @param {string} h160
 */
export function mailbox(h160) {
  const owner = h160.toLowerCase();
  return {
    mail: /** @type {ReturnType<typeof openCollection<MailRecord>>} */ (openCollection(`mail:${owner}`)),
    drafts: /** @type {ReturnType<typeof openCollection<Draft>>} */ (openCollection(`drafts:${owner}`)),
    contacts: /** @type {ReturnType<typeof openCollection<Contact>>} */ (openCollection(`contacts:${owner}`)),
    meta: /** @type {ReturnType<typeof openCollection<MailboxState>>} */ (openCollection(`meta:${owner}`)),
  };
}

/**
 * The current account's lowercase H160 once the host has provided it; null outside a
 * host or when no account arrives in time.
 *
 * @param {number} [timeoutMs]
 * @returns {Promise<string | null>}
 */
export async function currentAccount(timeoutMs = 15000) {
  const started = Date.now();
  for (;;) {
    const wallet = walletStore();
    if (wallet?.h160) return wallet.h160.toLowerCase();
    if (wallet?.mode === 'host-required') return null;
    if (Date.now() - started > timeoutMs) return null;
    await sleep(100);
  }
}

/**
 * The mailbox's sync state, with defaults for a fresh device.
 *
 * @param {string} h160
 * @returns {Promise<MailboxState>}
 */
export async function readState(h160) {
  return { inboxSynced: 0, ...((await mailbox(h160).meta.get('state')) ?? {}) };
}

/**
 * Merge `patch` into the mailbox's sync state.
 *
 * @param {string} h160
 * @param {Partial<MailboxState>} patch
 */
export async function writeState(h160, patch) {
  const next = { ...(await readState(h160)), ...patch };
  await mailbox(h160).meta.put('state', next);
  return next;
}

/**
 * The lowercase H160 for an SS58 or H160 address, or null when it is not one.
 *
 * @param {string | null | undefined} input
 * @returns {string | null}
 */
export function parseAddress(input) {
  const value = String(input ?? '').trim();
  if (!value) return null;
  if (/^0x[0-9a-fA-F]{40}$/.test(value)) return value.toLowerCase();
  if (value.startsWith('0x')) return null;
  try {
    const h160 = toH160(value);
    return /^0x[0-9a-f]{40}$/.test(h160) ? h160 : null;
  } catch {
    return null;
  }
}

/**
 * A short form of an address for display beside its avatar.
 *
 * @param {string | null | undefined} address
 */
export function shortAddress(address) {
  return address ? truncateAddress(address, 6, 4) : '';
}

/**
 * A UUIDv7: a millisecond timestamp followed by random bits, so ids sort by creation.
 *
 * @returns {string}
 */
export function uuidv7() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let time = Date.now();
  for (let i = 5; i >= 0; i--) {
    bytes[i] = time % 256;
    time = Math.floor(time / 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * A local return path from `?return=`, or `fallback`.
 *
 * @param {string} fallback
 * @param {string} [search]
 */
export function returnTo(fallback, search = window.location.search) {
  const value = new URLSearchParams(search).get('return') ?? '';
  return value.startsWith('/') && !value.startsWith('//') ? value : fallback;
}

/**
 * A message time for a list row: the time today, the weekday this week, else the date.
 *
 * @param {number} ms
 * @param {number} [now]
 */
export function mailTime(ms, now = Date.now()) {
  if (!ms) return '';
  const date = new Date(ms);
  const today = new Date(now);
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
  if (now - ms < 6 * 86400000) return date.toLocaleDateString(undefined, { weekday: 'short' });
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * A full date and time for a message header.
 *
 * @param {number} ms
 */
export function fullTime(ms) {
  if (!ms) return '';
  return new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
