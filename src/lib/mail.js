import { bytesToHex, hexToBytes } from '@parity/product-sdk-crypto';
import { createContract, contractErrorMessage } from './contracts.js';
import { isContractReady } from './contracts/ready.js';
import { PUBKEYREGISTRY_ABI, W3BMAILROUTER_ABI } from './contracts/abi.js';
import { PUBKEYREGISTRY_ADDRESS, W3BMAILROUTER_ADDRESS } from './contracts/config.js';
import { uploadBytes, fetchBytes, cidToBytes32, bytes32ToCid } from './bulletin.js';
import { deriveKeyPair } from './crypto/keys.js';
import { sealJson, openJson } from './crypto/seal.js';
import { ensureBulletinAllowance } from './host/allowances.js';
import { isAccountMapped } from './chain.js';
import { isDesignPreview, previewFallback } from './preview.js';
import { txStore, walletStore } from './stores.js';
import { mailbox, parseAddress, readState, writeState, uuidv7 } from './mailbox.js';

/**
 * Sending, receiving and keeping mail. Messages are sealed to the recipient's
 * registered key, stored on the Bulletin Chain, and announced through `W3bMailRouter`;
 * everything readable lives on this device.
 *
 * @typedef {import('./mailbox.js').MailRecord} MailRecord
 * @typedef {import('./mailbox.js').Folder} Folder
 *
 * @typedef {'registered' | 'unregistered' | 'changed' | 'unavailable'} KeyStatus
 * @typedef {'encrypting' | 'storing' | 'sending'} SendStep
 *
 * @typedef {object} OutgoingMail
 * @property {string} to  SS58 or H160.
 * @property {string} subject
 * @property {string} body
 */

const SEAL_INFO = 'w3mail:v1';
const PAGE_SIZE = 50;
const KEY_LENGTH = 32;
const RETENTION_MS = 13 * 86400000;

/** @type {ReturnType<typeof createContract> | null} */
let registryHandle = null;
/** @type {ReturnType<typeof createContract> | null} */
let routerHandle = null;

const registry = () => (registryHandle ??= createContract(PUBKEYREGISTRY_ABI, PUBKEYREGISTRY_ADDRESS));
const router = () => (routerHandle ??= createContract(W3BMAILROUTER_ABI, W3BMAILROUTER_ADDRESS));

/** Whether both mail contracts are deployed and wired. */
export function isMailServiceReady() {
  return (
    isContractReady(PUBKEYREGISTRY_ABI, PUBKEYREGISTRY_ADDRESS) &&
    isContractReady(W3BMAILROUTER_ABI, W3BMAILROUTER_ADDRESS)
  );
}

/** @param {unknown} value */
function bytesOf(value) {
  if (value instanceof Uint8Array) return value;
  const binary = /** @type {{ asBytes?: () => Uint8Array, asHex?: () => string }} */ (value);
  if (binary && typeof binary.asBytes === 'function') return binary.asBytes();
  if (typeof value === 'string') return hexToBytes(value.replace(/^0x/, ''));
  return new Uint8Array();
}

/** @param {unknown} value */
const hexOf = (value) => /** @type {`0x${string}`} */ (`0x${bytesToHex(bytesOf(value))}`);

/** @param {unknown} value */
const lower = (value) => String(value ?? '').toLowerCase();

/** The read origin for calls that answer for `msg.sender`. */
const readOrigin = () => ({ origin: walletStore()?.address });

/**
 * This account's mailbox key, derived by the host; the secret never leaves memory.
 *
 * @param {string} h160
 */
export function mailboxKey(h160) {
  return deriveKeyPair(`w3mail:x25519:v1:${h160.toLowerCase()}`);
}

/**
 * Whether the account's key is on chain and matches the one this device derives.
 *
 * @param {string} h160
 * @returns {Promise<KeyStatus>}
 */
export async function keyStatus(h160) {
  if (isDesignPreview()) return 'registered';
  if (!isMailServiceReady()) return 'unavailable';
  const has = await registry().read('hasPubKey', [h160]);
  if (!has) return 'unregistered';
  const onChain = hexOf(await registry().read('fetchPubKey', [h160]));
  const { publicKey } = await mailboxKey(h160);
  return onChain === `0x${bytesToHex(publicKey)}` ? 'registered' : 'changed';
}

/**
 * Put this account's mailbox key on chain so others can write to it.
 *
 * @param {string} h160
 */
export async function registerKey(h160) {
  if (!isMailServiceReady()) throw new Error('Mail is not available yet. Try again in a moment.');
  const { publicKey } = await mailboxKey(h160);
  const hex = `0x${bytesToHex(publicKey)}`;
  const result = await registry().write('registerPubKey', [hex]);
  await writeState(h160, { publicKey: hex, registeredAt: Date.now() });
  return result;
}

/**
 * The public key messages to `recipient` are sealed with.
 *
 * @param {string} recipient  H160.
 */
async function recipientKey(recipient) {
  const has = await registry().read('hasPubKey', [recipient]);
  if (!has) {
    throw new Error("This address hasn't set up w3mail yet. Ask them to open w3mail once, then send again.");
  }
  const key = bytesOf(await registry().read('fetchPubKey', [recipient]));
  if (key.length !== KEY_LENGTH) {
    throw new Error("This address's mail key is invalid; they need to set up w3mail again.");
  }
  return key;
}

/**
 * Seal, store and announce a message. `onStep` reports progress; the sent copy is kept
 * on this device, the only place it can be read again.
 *
 * @param {string} h160  The sender.
 * @param {OutgoingMail} mail
 * @param {(step: SendStep) => void} [onStep]
 * @returns {Promise<MailRecord>}
 */
export async function sendMail(h160, mail, onStep = () => {}) {
  if (!isMailServiceReady()) throw new Error('Mail is not available yet. Try again in a moment.');
  const to = parseAddress(mail.to);
  if (!to) throw new Error('Enter a valid address.');
  const from = h160.toLowerCase();

  onStep('encrypting');
  const publicKey = await recipientKey(to);
  const sentAt = Date.now();
  const msgId = uuidv7();
  const sealed = sealJson(
    { v: 1, from, to, subject: mail.subject, body: mail.body, sentAt },
    publicKey,
    SEAL_INFO,
  );

  onStep('storing');
  const { cid } = await uploadBytes(sealed);

  onStep('sending');
  await router().write('sendMessage', [to, cidToBytes32(cid), msgId]);

  /** @type {MailRecord} */
  const record = {
    key: to === from ? `${msgId}:sent` : msgId,
    msgId,
    folder: 'sent',
    from,
    to,
    subject: mail.subject,
    body: mail.body,
    cid,
    timestamp: sentAt,
    read: true,
    expired: false,
    deleted: false,
  };
  await mailbox(h160).mail.put(record.key, record);
  return record;
}

/** @param {unknown} err */
const isGone = (err) => err instanceof Error && /not available on Bulletin/i.test(err.message);

/**
 * The local record for one on-chain inbox entry, or null for a deleted one. Throws on a
 * transient failure so the entry is retried on the next sync.
 *
 * @param {any} entry
 * @param {Uint8Array} secretKey
 * @param {string} key  The local record key.
 * @returns {Promise<MailRecord | null>}
 */
async function inboxRecord(entry, secretKey, key) {
  if (entry.deleted) return null;
  const cid = bytes32ToCid(hexOf(entry.messageCid));
  const timestamp = Number(entry.timestamp) * 1000;
  /** @type {MailRecord} */
  const base = {
    key,
    msgId: String(entry.msgId),
    folder: 'inbox',
    from: lower(entry.sender),
    to: lower(entry.receiver),
    subject: '',
    body: '',
    cid,
    timestamp,
    read: false,
    expired: false,
    deleted: false,
  };

  let sealed;
  try {
    sealed = await fetchBytes(cid, { timeoutMs: 20000 });
  } catch (err) {
    if (isGone(err) && Date.now() - timestamp > RETENTION_MS) return { ...base, expired: true };
    throw err;
  }

  try {
    const message = /** @type {any} */ (openJson(sealed, secretKey, SEAL_INFO));
    return {
      ...base,
      subject: String(message?.subject ?? ''),
      body: String(message?.body ?? ''),
      timestamp: Number(message?.sentAt) || timestamp,
    };
  } catch {
    return { ...base, expired: true };
  }
}

/**
 * The local key an inbox entry is stored under, or null when it is already stored.
 * msgIds are chosen by senders, so one reused by a different sender is kept apart.
 *
 * @param {ReturnType<typeof mailbox>} box
 * @param {any} entry
 * @returns {Promise<string | null>}
 */
async function inboxKey(box, entry) {
  const msgId = String(entry.msgId);
  const sender = lower(entry.sender);
  const existing = await box.mail.get(msgId);
  if (!existing) return msgId;
  if (lower(existing.from) === sender) return null;
  const separate = `${sender}:${msgId}`;
  return (await box.mail.get(separate)) ? null : separate;
}

/** @param {MailRecord} m */
const isReceived = (m) => (m.previousFolder ?? m.folder) === 'inbox';

/** @type {Promise<{ added: number }> | null} */
let syncInFlight = null;

/**
 * Fetch, decrypt and keep every inbox entry this device has not seen yet. Progress is
 * saved per entry, so an interrupted sync resumes where it stopped. Only one sync runs
 * at a time; a second call joins the one in flight. Nothing is read until the account
 * is mapped, since an unmapped read would answer for another mailbox.
 *
 * @param {string} h160
 * @returns {Promise<{ added: number }>}
 */
export function syncInbox(h160) {
  syncInFlight ??= runSync(h160).finally(() => {
    syncInFlight = null;
  });
  return syncInFlight;
}

/** @param {string} h160 */
async function runSync(h160) {
  if (!isMailServiceReady() || isDesignPreview()) return { added: 0 };
  const address = walletStore()?.address;
  if (!address || !(await isAccountMapped(address))) return { added: 0 };

  const box = mailbox(h160);
  const active = Number((await router().read('getActiveInboxCount', [h160])) ?? 0);
  const local = (await box.mail.all()).filter(isReceived).length;
  if (active === local) {
    await writeState(h160, { lastSyncedAt: Date.now() });
    return { added: 0 };
  }

  const { secretKey } = await mailboxKey(h160);
  let offset = (await readState(h160)).inboxSynced;
  let added = 0;

  for (;;) {
    const result = await router().read('getInboxPage', [BigInt(offset), BigInt(PAGE_SIZE), readOrigin()]);
    const page = /** @type {any[]} */ (result?.page ?? []);
    const total = Number(result?.total ?? 0);
    if (page.length === 0) break;
    for (const entry of page) {
      const key = entry.deleted ? null : await inboxKey(box, entry);
      const record = key ? await inboxRecord(entry, secretKey, key) : null;
      if (record) {
        await box.mail.put(record.key, record);
        added++;
      }
      offset++;
      await writeState(h160, { inboxSynced: offset });
    }
    if (offset >= total) break;
  }

  await writeState(h160, { lastSyncedAt: Date.now() });
  return { added };
}

const MINUTE = 60000;
const DAY = 86400000;
const ADA = '0x8eaf04151687736326c9fea17e25fc5287613693';
const BEN = '0x90b5ab205c6974c9ea841be688864633dc9ca8a3';
const CHIARA = '0x306721211d5404bd9da88e0204360a1a9ab8b87c';
const DMITRI = '0xe659a7a1628cdd93febc04a4e0646ea20e9f5f0c';
const PREVIEW_SELF = '0x9621dde636de098b43efb0fa9b61facfe328f99d';

/**
 * @param {Partial<MailRecord> & { msgId: string, folder: Folder, from: string, to: string, subject: string, body: string, timestamp: number }} fields
 * @returns {MailRecord}
 */
const sample = (fields) => ({ key: fields.msgId, cid: '', read: true, expired: false, deleted: false, ...fields });

/** @type {MailRecord[]} */
const SAMPLE_MAIL = [
  sample({ msgId: 'sample-1', folder: 'inbox', from: ADA, to: PREVIEW_SELF, subject: 'Saturday walk?', body: 'The forecast looks clear. Meet at the north gate at ten?\nI can bring coffee.', timestamp: Date.now() - 25 * MINUTE, read: false }),
  sample({ msgId: 'sample-2', folder: 'inbox', from: BEN, to: PREVIEW_SELF, subject: 'Draft of the proposal', body: 'I tightened the second section and cut the appendix. Have a look when you can.', timestamp: Date.now() - 3 * 60 * MINUTE, read: false }),
  sample({ msgId: 'sample-3', folder: 'inbox', from: CHIARA, to: PREVIEW_SELF, subject: 'Photos from the trip', body: 'Sorting through them now. The lake ones came out best.', timestamp: Date.now() - 2 * DAY }),
  sample({ msgId: 'sample-4', folder: 'inbox', from: DMITRI, to: PREVIEW_SELF, subject: '', body: '', timestamp: Date.now() - 20 * DAY, expired: true }),
  sample({ msgId: 'sample-5', folder: 'sent', from: PREVIEW_SELF, to: ADA, subject: 'Re: Book club', body: 'Count me in for next month. I will finish the last chapter this week.', timestamp: Date.now() - 50 * MINUTE }),
  sample({ msgId: 'sample-6', folder: 'sent', from: PREVIEW_SELF, to: BEN, subject: 'Invoice for March', body: 'Attached the numbers in the body below, as agreed.', timestamp: Date.now() - 4 * DAY }),
  sample({ msgId: 'sample-7', folder: 'trash', previousFolder: 'inbox', from: DMITRI, to: PREVIEW_SELF, subject: 'Newsletter: spring edition', body: 'Ten things we learned this season.', timestamp: Date.now() - 6 * DAY }),
];

/**
 * A folder's messages, newest first.
 *
 * @param {string} h160
 * @param {Folder} folder
 * @returns {Promise<MailRecord[]>}
 */
export async function listFolder(h160, folder) {
  const all = await mailbox(h160).mail.all();
  const list = all.filter((m) => m.folder === folder).sort((a, b) => b.timestamp - a.timestamp);
  return previewFallback(list, SAMPLE_MAIL.filter((m) => m.folder === folder));
}

/**
 * How many messages each folder holds, and how many inbox messages are unread.
 *
 * @param {string} h160
 */
export async function folderCounts(h160) {
  const all = previewFallback(await mailbox(h160).mail.all(), SAMPLE_MAIL);
  const counts = { inbox: 0, sent: 0, trash: 0, unread: 0 };
  for (const m of all) {
    counts[m.folder]++;
    if (m.folder === 'inbox' && !m.read) counts.unread++;
  }
  return counts;
}

/**
 * @param {string} h160
 * @param {string} key
 * @returns {Promise<MailRecord | null>}
 */
export async function getMessage(h160, key) {
  const found = await mailbox(h160).mail.get(key);
  return found ?? previewFallback(null, SAMPLE_MAIL.find((m) => m.key === key) ?? null);
}

/**
 * @param {string} h160
 * @param {string} key
 * @param {(record: MailRecord) => MailRecord} change
 */
async function update(h160, key, change) {
  const box = mailbox(h160);
  const record = await box.mail.get(key);
  if (!record) return null;
  const next = change(record);
  await box.mail.put(key, next);
  return next;
}

/**
 * @param {string} h160
 * @param {string} key
 */
export function markRead(h160, key) {
  return update(h160, key, (m) => ({ ...m, read: true }));
}

/**
 * Move a message to trash, remembering where it came from.
 *
 * @param {string} h160
 * @param {string} key
 */
export function moveToTrash(h160, key) {
  return update(h160, key, (m) =>
    m.folder === 'trash' ? m : { ...m, previousFolder: m.folder, folder: 'trash' },
  );
}

/**
 * Put a trashed message back where it was.
 *
 * @param {string} h160
 * @param {string} key
 */
export function restoreMessage(h160, key) {
  return update(h160, key, (m) => {
    const { previousFolder, ...rest } = m;
    return { ...rest, folder: previousFolder ?? (m.from === h160.toLowerCase() ? 'sent' : 'inbox') };
  });
}

/**
 * Delete a message for good: a received message is removed from the mailbox on chain,
 * then every message is removed from this device.
 *
 * @param {string} h160
 * @param {string} key
 */
export async function purgeMessage(h160, key) {
  const box = mailbox(h160);
  const record = await box.mail.get(key);
  if (!record) return;
  const received = (record.previousFolder ?? record.folder) === 'inbox';
  if (received && isMailServiceReady()) {
    await router().write('deleteMessages', [[record.msgId]]);
  }
  await box.mail.remove(key);
}

/**
 * Whether the host has granted storage for messages on this device, without asking.
 *
 * @returns {boolean}
 */
export function hasStorageAllowance() {
  try {
    return localStorage.getItem('host.allowance.default.BulletinAllowance') === 'granted';
  } catch {
    return false;
  }
}

/**
 * Ask the host for message storage now, instead of on the first send.
 *
 * @returns {Promise<boolean>}
 */
export async function requestStorageAllowance() {
  const result = await ensureBulletinAllowance();
  return result.ok;
}

/** @type {[RegExp, string][]} */
const PLAIN_ERRORS = [
  [/no public key/i, "This address hasn't set up w3mail yet. Ask them to open w3mail once, then send again."],
  [/inbox full/i, 'Their inbox is full.'],
  [/bad msgid|empty cid/i, 'The message could not be prepared. Try sending it again.'],
  [/zero receiver/i, 'Enter a valid address.'],
  [/cancel|reject/i, 'You cancelled. Nothing was changed.'],
  [/not enough|insufficient/i, 'Your account does not have enough funds for this. Top it up, then try again.'],
  [/storage is full/i, 'This device is out of space for mail. Delete some messages, then try again.'],
  [/upload|preimage|bulletin/i, 'The message could not be stored. Check your connection, then try again.'],
  [/permission/i, 'Allow w3mail to send when the Polkadot app asks, then try again.'],
];

/**
 * A sentence a person can act on, in mail words.
 *
 * @param {unknown} err
 * @returns {string}
 */
export function mailErrorMessage(err) {
  const raw = `${err instanceof Error ? err.message : String(err ?? '')} ${contractErrorMessage(err)}`;
  for (const [pattern, message] of PLAIN_ERRORS) if (pattern.test(raw)) return message;
  const own = err instanceof Error ? err.message : '';
  if (own && !/transaction|contract|revert|dispatch|0x/i.test(own)) return own;
  return 'Something went wrong. Try again in a moment.';
}

/**
 * Run a mailbox change that needs the person's approval, reporting it in the status
 * tray as pending, then done or failed.
 *
 * @template T
 * @param {string} title
 * @param {string} doneMessage
 * @param {() => Promise<T>} run
 * @returns {Promise<T>}
 */
export async function trackMail(title, doneMessage, run) {
  const tray = txStore();
  const id = tray.pending(title, 'Approve in the Polkadot app…');
  try {
    const result = await run();
    tray.confirmed(id, { message: doneMessage });
    return result;
  } catch (err) {
    tray.failed(id, mailErrorMessage(err));
    throw err;
  }
}
