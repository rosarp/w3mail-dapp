import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bytesToHex, nacl, sha256, utf8ToBytes } from '@parity/product-sdk-crypto';

const net = vi.hoisted(() => ({
  sender: '',
  mapped: true,
  keySalt: /** @type {Record<string, string>} */ ({}),
  keys: new Map(),
  inbox: /** @type {any[]} */ ([]),
  blobs: new Map(),
  cids: new Map(),
  calls: /** @type {{ fn: string, args: any[] }[]} */ ([]),
  wallet: /** @type {any} */ ({}),
  tray: { pending: () => 1, confirmed: () => {}, failed: () => {} },
}));

vi.mock('@parity/product-sdk-host', () => ({ getHostLocalStorage: async () => null }));
vi.mock('./host/detection.js', () => ({ isInHost: () => false, isDesignPreview: () => false }));
vi.mock('./host/allowances.js', () => ({ ensureBulletinAllowance: async () => ({ ok: true }) }));
vi.mock('./component.js', () => ({ component: (/** @type {any} */ data) => data }));
vi.mock('./stores.js', () => ({
  walletStore: () => net.wallet,
  txStore: () => net.tray,
  toastStore: () => ({ push: () => {} }),
  faucetStore: () => ({ prompt: () => {} }),
}));
vi.mock('./chain.js', () => ({
  isAccountMapped: async () => net.mapped,
  onBlock: () => () => {},
}));
vi.mock('./crypto/keys.js', () => ({
  deriveKeyPair: async (/** @type {string} */ context) =>
    nacl.box.keyPair.fromSecretKey(sha256(utf8ToBytes(context + (net.keySalt[context] ?? '')))),
}));
vi.mock('./bulletin.js', () => ({
  uploadBytes: async (/** @type {Uint8Array} */ bytes) => {
    const cid = `cid-${net.blobs.size + 1}`;
    net.blobs.set(cid, bytes);
    return { cid };
  },
  fetchBytes: async (/** @type {string} */ cid) => {
    if (!net.blobs.has(cid)) throw new Error('The file is not available on Bulletin');
    return net.blobs.get(cid);
  },
  cidToBytes32: (/** @type {string} */ cid) => {
    const hex = `0x${cid.replace('cid-', '').padStart(64, '0')}`;
    net.cids.set(hex, cid);
    return hex;
  },
  bytes32ToCid: (/** @type {string} */ hex) => net.cids.get(hex.toLowerCase()) ?? 'cid-missing',
}));
vi.mock('./contracts.js', async () => {
  const { PUBKEYREGISTRY_ADDRESS } = await import('./contracts/config.js');
  const active = (/** @type {string} */ who) => net.inbox.filter((e) => e.receiver === who && !e.deleted);
  const handlers = {
    hasPubKey: ([who]) => net.keys.has(who),
    fetchPubKey: ([who]) => net.keys.get(who),
    registerPubKey: ([hex]) => net.keys.set(net.sender, hex),
    sendMessage: ([to, messageCid, msgId]) =>
      net.inbox.push({
        msgId,
        sender: net.sender,
        receiver: to,
        messageCid,
        timestamp: BigInt(Math.floor(Date.now() / 1000)),
        deleted: false,
      }),
    getActiveInboxCount: ([who]) => BigInt(active(who).length),
    getInboxPage: ([offset, limit, { origin }]) => {
      const all = net.inbox.filter((e) => e.receiver === origin);
      return { page: all.slice(Number(offset), Number(offset) + Number(limit)), total: BigInt(all.length) };
    },
    deleteMessages: ([ids]) => {
      for (const e of net.inbox) if (e.receiver === net.sender && ids.includes(e.msgId)) e.deleted = true;
    },
  };
  /** @param {string} fn @param {any[]} args */
  const call = async (fn, args) => {
    net.calls.push({ fn, args });
    return /** @type {any} */ (handlers)[fn](args);
  };
  return {
    createContract: (/** @type {unknown} */ _abi, /** @type {string} */ address) => ({
      address,
      read: call,
      write: call,
      isRegistry: address === PUBKEYREGISTRY_ADDRESS,
    }),
    contractErrorMessage: () => '',
    toH160: () => {
      throw new Error('not an address');
    },
  };
});

import { resetStore } from './store.js';
import { mailbox, readState } from './mailbox.js';
import {
  keyStatus,
  listFolder,
  mailboxKey,
  moveToTrash,
  purgeMessage,
  registerKey,
  restoreMessage,
  sendMail,
  syncInbox,
} from './mail.js';
import { homePage } from './pages/home.js';

const ALICE = '0x' + 'a1'.repeat(20);
const BOB = '0x' + 'b0'.repeat(20);
const CAROL = '0x' + 'c3'.repeat(20);

/** @param {string} h160 */
function actAs(h160) {
  net.sender = h160;
  net.wallet = { address: h160, h160, mode: 'dev' };
}

/** @param {string} h160 */
async function register(h160) {
  actAs(h160);
  await registerKey(h160);
}

const calls = (/** @type {string} */ fn) => net.calls.filter((c) => c.fn === fn);

beforeEach(() => {
  resetStore();
  net.mapped = true;
  net.keySalt = {};
  net.keys = new Map();
  net.inbox = [];
  net.blobs = new Map();
  net.cids = new Map();
  net.calls = [];
});

describe('sendMail', () => {
  it('seals to the recipient key so only their key pair opens it', async () => {
    await register(BOB);
    await register(ALICE);
    const sent = await sendMail(ALICE, { to: BOB, subject: 'Hi', body: 'Lunch?' });

    expect(sent.folder).toBe('sent');
    expect(net.inbox).toHaveLength(1);
    const blob = net.blobs.get(sent.cid);
    expect(new TextDecoder().decode(blob)).not.toContain('Lunch?');

    actAs(BOB);
    expect(await syncInbox(BOB)).toEqual({ added: 1 });
    const [received] = await listFolder(BOB, 'inbox');
    expect(received).toMatchObject({ subject: 'Hi', body: 'Lunch?', from: ALICE, read: false, expired: false });
    expect((await listFolder(ALICE, 'sent'))[0].body).toBe('Lunch?');
  });

  it('stops for a recipient who has not set up w3mail', async () => {
    await register(ALICE);
    await expect(sendMail(ALICE, { to: BOB, subject: 'Hi', body: 'x' })).rejects.toThrow(
      "hasn't set up w3mail yet",
    );
    expect(calls('sendMessage')).toHaveLength(0);
    expect(net.blobs.size).toBe(0);
  });

  it('rejects an address that is not one', async () => {
    await register(ALICE);
    await expect(sendMail(ALICE, { to: '0x1234', subject: '', body: '' })).rejects.toThrow('valid address');
  });
});

describe('syncInbox', () => {
  /** @param {number} n */
  async function aliceSendsBob(n) {
    actAs(ALICE);
    for (let i = 0; i < n; i++) await sendMail(ALICE, { to: BOB, subject: `m${i}`, body: `b${i}` });
    actAs(BOB);
  }

  beforeEach(async () => {
    await register(BOB);
    await register(ALICE);
  });

  it('pages from inboxSynced and is idempotent', async () => {
    await aliceSendsBob(2);
    expect(await syncInbox(BOB)).toEqual({ added: 2 });
    expect((await readState(BOB)).inboxSynced).toBe(2);

    net.calls = [];
    expect(await syncInbox(BOB)).toEqual({ added: 0 });
    expect(calls('getInboxPage')).toHaveLength(0);

    await aliceSendsBob(1);
    net.calls = [];
    expect(await syncInbox(BOB)).toEqual({ added: 1 });
    expect(calls('getInboxPage')[0].args[0]).toBe(2n);
    expect(await listFolder(BOB, 'inbox')).toHaveLength(3);
  });

  it('skips entries already stored and entries deleted on chain', async () => {
    await aliceSendsBob(3);
    const [first, second] = net.inbox;
    await mailbox(BOB).mail.put(first.msgId, {
      key: first.msgId,
      msgId: first.msgId,
      folder: 'inbox',
      from: ALICE,
      to: BOB,
      subject: 'kept',
      body: 'kept',
      cid: '',
      timestamp: 1,
      read: true,
      expired: false,
      deleted: false,
    });
    second.deleted = true;

    expect(await syncInbox(BOB)).toEqual({ added: 1 });
    expect((await mailbox(BOB).mail.get(first.msgId))?.subject).toBe('kept');
    expect(await mailbox(BOB).mail.get(second.msgId)).toBeNull();
    expect((await readState(BOB)).inboxSynced).toBe(3);
  });

  it('stores an expired blob and an undecryptable one as expired', async () => {
    await aliceSendsBob(2);
    const [gone, garbled] = net.inbox;
    gone.timestamp = BigInt(Math.floor((Date.now() - 20 * 86400000) / 1000));
    net.blobs.delete(net.cids.get(gone.messageCid));
    net.blobs.set(net.cids.get(garbled.messageCid), new Uint8Array(100));

    expect(await syncInbox(BOB)).toEqual({ added: 2 });
    const stored = await listFolder(BOB, 'inbox');
    expect(stored.every((m) => m.expired && m.body === '')).toBe(true);
  });

  it('retries a recent blob that is not available yet', async () => {
    await aliceSendsBob(1);
    const [entry] = net.inbox;
    const cid = net.cids.get(entry.messageCid);
    const blob = net.blobs.get(cid);
    net.blobs.delete(cid);

    await expect(syncInbox(BOB)).rejects.toThrow('not available');
    expect((await readState(BOB)).inboxSynced).toBe(0);

    net.blobs.set(cid, blob);
    expect(await syncInbox(BOB)).toEqual({ added: 1 });
  });

  it('does nothing while the account is unmapped', async () => {
    await aliceSendsBob(1);
    net.mapped = false;
    net.calls = [];
    expect(await syncInbox(BOB)).toEqual({ added: 0 });
    expect(net.calls).toHaveLength(0);
    expect(await listFolder(BOB, 'inbox')).toHaveLength(0);
  });
});

describe('keys and first use', () => {
  it('reports unregistered, registered and changed keys', async () => {
    actAs(ALICE);
    expect(await keyStatus(ALICE)).toBe('unregistered');
    await registerKey(ALICE);
    expect(await keyStatus(ALICE)).toBe('registered');
    const { publicKey } = await mailboxKey(ALICE);
    expect(net.keys.get(ALICE)).toBe(`0x${bytesToHex(publicKey)}`);
    net.keys.set(ALICE, '0x' + '00'.repeat(32));
    expect(await keyStatus(ALICE)).toBe('changed');
  });

  it('asks to register only when the key is missing or changed', async () => {
    actAs(ALICE);
    const page = /** @type {any} */ (homePage());
    page.h160 = ALICE;

    await page.refresh();
    expect(page.status).toBe('setup');
    expect(calls('registerPubKey')).toHaveLength(0);

    await page.register();
    expect(page.status).toBe('ready');
    expect(calls('registerPubKey')).toHaveLength(1);

    const again = /** @type {any} */ (homePage());
    again.h160 = ALICE;
    await again.refresh();
    expect(again.status).toBe('ready');
    expect(again.keyChanged).toBe(false);

    net.keySalt[`w3mail:x25519:v1:${ALICE}`] = 'new-device';
    const changed = /** @type {any} */ (homePage());
    changed.h160 = ALICE;
    await changed.refresh();
    expect(changed.status).toBe('setup');
    expect(changed.keyChanged).toBe(true);
    expect(calls('registerPubKey')).toHaveLength(1);
  });
});

describe('trash, restore and purge', () => {
  beforeEach(async () => {
    await register(BOB);
    await register(ALICE);
    await sendMail(ALICE, { to: BOB, subject: 'Hello', body: 'there' });
    actAs(BOB);
    await syncInbox(BOB);
  });

  it('round trips a message through trash', async () => {
    const [message] = await listFolder(BOB, 'inbox');
    await moveToTrash(BOB, message.key);
    expect(await listFolder(BOB, 'inbox')).toHaveLength(0);
    expect((await listFolder(BOB, 'trash'))[0].previousFolder).toBe('inbox');
    await restoreMessage(BOB, message.key);
    const [back] = await listFolder(BOB, 'inbox');
    expect(back.key).toBe(message.key);
    expect(back.previousFolder).toBeUndefined();
  });

  it('purges a received message on chain and from the device', async () => {
    const [message] = await listFolder(BOB, 'inbox');
    await moveToTrash(BOB, message.key);
    await purgeMessage(BOB, message.key);
    expect(calls('deleteMessages').at(-1)?.args).toEqual([[message.msgId]]);
    expect(net.inbox[0].deleted).toBe(true);
    expect(await mailbox(BOB).mail.get(message.key)).toBeNull();
    expect(await listFolder(BOB, 'trash')).toHaveLength(0);
  });

  it('removes a sent message from the device only', async () => {
    actAs(ALICE);
    const [sent] = await listFolder(ALICE, 'sent');
    net.calls = [];
    await purgeMessage(ALICE, sent.key);
    expect(calls('deleteMessages')).toHaveLength(0);
    expect(await listFolder(ALICE, 'sent')).toHaveLength(0);
  });
});

describe('mailboxes', () => {
  it('keeps two accounts apart', async () => {
    await register(BOB);
    await register(CAROL);
    await register(ALICE);
    await sendMail(ALICE, { to: BOB, subject: 'for bob', body: '' });
    actAs(BOB);
    await syncInbox(BOB);
    actAs(CAROL);
    await syncInbox(CAROL);

    expect(await listFolder(BOB, 'inbox')).toHaveLength(1);
    expect(await listFolder(CAROL, 'inbox')).toHaveLength(0);
    expect(await listFolder(BOB, 'sent')).toHaveLength(0);
    expect(await listFolder(ALICE, 'inbox')).toHaveLength(0);
  });
});
