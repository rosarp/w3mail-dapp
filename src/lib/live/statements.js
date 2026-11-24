import { StatementStoreClient } from '@parity/product-sdk-statement-store';
import { getAccountsProvider, fromHex } from '@parity/product-sdk-host';
import { accountIdFromBytes } from '@parity/product-sdk-address';
import { ensureStatementAllowance } from '../host/allowances.js';
import { isInHost, productIdentifier } from '../host/detection.js';

/**
 * Live cross-user pub/sub over the host Statement Store, through
 * `@parity/product-sdk-statement-store`. Every user of this product sees statements
 * every other user publishes, in real time.
 *
 * - Statements carry the product's topic (`dapp:<productId>`) and a second topic per
 *   store name, so each `createTopicStore(name)` sees only its own traffic.
 * - Payloads travel in a bigint-safe JSON envelope; the store caps one at 512 bytes.
 * - Statements sharing an (author, channel) replace each other — use a channel for
 *   presence heartbeats and reactions, omit it for append-style feeds.
 * - Statements expire: one hour by default, `ttlSeconds` to change it.
 * - The statement allowance is claimed lazily before the first submit.
 * - Outside a host every store is inert: `subscribe` never fires with data, `submit`
 *   resolves silently, `isLive()` is false. No throws, no mock data.
 *
 * Authorship is cryptographic: an entry's author is the statement proof's signer — the
 * host's allowance account for this user and product — never self-claimed.
 *
 * @template T
 * @typedef {object} StatementEntry
 * @property {string} id  Unique, generated at publish time.
 * @property {string} author  SS58 of the proof signer.
 * @property {number} timestamp  Epoch ms claimed by the publisher.
 * @property {T} data
 * @property {string} [label]  The publisher's DotNS username, display-only.
 */

/**
 * @typedef {object} SubmitOptions
 * @property {string} [channel]  Same (author, channel) replaces the previous statement.
 * @property {boolean} [interactive]  False never prompts for a host login; the submit
 *   is skipped silently without a session. Default true.
 * @property {number} [ttlSeconds]  How long the statement lives. Default one hour.
 */

/**
 * @template T
 * @typedef {object} TopicStore
 * @property {(cb: (entries: ReadonlyArray<StatementEntry<T>>) => void) => () => void} subscribe
 *   The live entry list, newest first: fires immediately with the current snapshot, then
 *   on every change. Returns an unsubscribe function.
 * @property {(data: T, opts?: SubmitOptions) => Promise<void>} submit
 *   Publish to this topic, claiming the allowance lazily.
 * @property {() => Promise<Array<StatementEntry<T>>>} list
 *   Resolves once the stored history has arrived, or after 8s.
 * @property {() => boolean} isLive  A host subscription is active.
 * @property {() => Promise<string | null>} selfAuthor
 *   The current user's author address, or null without a host session. Never prompts.
 */

const DEFAULT_TTL_SECONDS = 3600;
const HISTORY_SETTLE_MS = 1500;
const HISTORY_TIMEOUT_MS = 8000;
const BIGINT_TAG = '\u0000bigint:';

/** @param {unknown} value */
const toWire = (value) =>
  JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? BIGINT_TAG + v.toString() : v)));

/** @param {unknown} value */
const fromWire = (value) =>
  JSON.parse(JSON.stringify(value), (_k, v) =>
    typeof v === 'string' && v.startsWith(BIGINT_TAG) ? BigInt(v.slice(BIGINT_TAG.length)) : v,
  );

function randomId() {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** @param {string | undefined} hex */
function authorFromSigner(hex) {
  if (!hex) return 'unknown';
  try {
    return accountIdFromBytes(fromHex(hex));
  } catch {
    return hex;
  }
}

/** @type {StatementStoreClient | null} */
let client = null;
/** @type {Promise<StatementStoreClient> | null} */
let connecting = null;

/** The product's one statement client, connected on first use. */
function getClient() {
  connecting ??= (async () => {
    client = new StatementStoreClient({
      appName: `dapp:${productIdentifier()}`,
      defaultTtlSeconds: DEFAULT_TTL_SECONDS,
    });
    await client.connect({ mode: 'host' });
    return client;
  })().catch((err) => {
    client?.destroy();
    client = null;
    connecting = null;
    throw err;
  });
  return connecting;
}

/**
 * @typedef {object} SelfIdentity
 * @property {string} address  The product account, until the user's own statements
 *   reveal the signer the host authors them with.
 * @property {string} [label]
 */

/** @type {SelfIdentity | null} */
let identity = null;
/** @type {Promise<SelfIdentity | null> | null} */
let identityInFlight = null;
/** @type {string | null} */
let signerAddress = null;

/**
 * @param {boolean} interactive
 * @returns {Promise<SelfIdentity | null>}
 */
async function fetchIdentity(interactive) {
  const accounts = await getAccountsProvider();
  if (!accounts) return null;
  const dotNs = productIdentifier();
  const productAccount = () =>
    accounts.getProductAccount(dotNs, 0).match(
      (account) => account,
      () => null,
    );

  let account = await productAccount();
  if (!account && interactive) {
    const login = await accounts.requestLogin('Enable live activity, presence and reactions').match(
      (outcome) => outcome,
      () => null,
    );
    if (!login || login === 'rejected') return null;
    account = await productAccount();
  }
  if (!account) return null;

  const label = await accounts.getUserId().match(
    (user) => user.primaryUsername,
    () => undefined,
  );
  identity = { address: accountIdFromBytes(account.publicKey), label };
  return identity;
}

/**
 * @param {boolean} interactive
 * @returns {Promise<SelfIdentity | null>}
 */
async function resolveIdentity(interactive) {
  if (identity) return identity;
  if (!isInHost()) return null;
  if (identityInFlight) {
    const result = await identityInFlight;
    if (result || !interactive) return result;
  }
  const attempt = fetchIdentity(interactive).finally(() => {
    identityInFlight = null;
  });
  identityInFlight = attempt;
  return attempt;
}

/**
 * Envelope ids this page published, each with the key of its optimistic entry, to
 * recognise the user's own statements on the way back.
 *
 * @type {Map<string, string>}
 */
const published = new Map();

/** @type {Map<string, TopicStore<any>>} */
const topicStores = new Map();

/**
 * The live store for an app-scoped topic. Cached per topic, so every component on the
 * same topic shares one subscription — keep one payload shape per topic.
 *
 * @template T
 * @param {string} topic
 * @returns {TopicStore<T>}
 */
export function createTopicStore(topic) {
  let store = topicStores.get(topic);
  if (!store) {
    store = buildTopicStore(topic);
    topicStores.set(topic, store);
  }
  return store;
}

/**
 * @param {string} topic
 * @returns {TopicStore<any>}
 */
function buildTopicStore(topic) {
  const inHost = isInHost();
  const topic2 = `topic:${topic}`;

  /** @type {Map<string, StatementEntry<any>>} */
  const entries = new Map();
  /** @type {Set<(snap: ReadonlyArray<StatementEntry<any>>) => void>} */
  const listeners = new Set();

  /** @type {Array<StatementEntry<any>>} */
  let snapshot = [];
  let dirty = false;
  let live = false;
  let warnedNoHost = false;
  /** @type {{ unsubscribe(): void } | null} */
  let subscription = null;
  /** @type {Promise<void> | null} */
  let starting = null;
  let lastArrival = 0;

  const getSnapshot = () => {
    if (dirty) {
      snapshot = [...entries.values()].sort(
        (a, b) => b.timestamp - a.timestamp || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0),
      );
      dirty = false;
    }
    return snapshot;
  };

  const notify = () => {
    const snap = getSnapshot();
    for (const listener of listeners) {
      try {
        listener(snap);
      } catch (err) {
        console.error(`[live] listener for topic "${topic}" threw:`, err);
      }
    }
  };

  /** @param {import('@parity/product-sdk-statement-store').ReceivedStatement<any>} stmt */
  const merge = (stmt) => {
    const env = stmt.data;
    if (!env || typeof env !== 'object' || env.v !== 1) return;
    if (typeof env.id !== 'string' || typeof env.ts !== 'number') return;

    const author = authorFromSigner(stmt.signerHex);
    const optimistic = published.get(env.id);
    if (optimistic) {
      signerAddress = author;
      entries.delete(optimistic);
    }
    const key = stmt.channelHex ? `c:${author}:${stmt.channelHex}` : `i:${env.id}`;
    const prev = entries.get(key);
    if (prev && (prev.id === env.id || prev.timestamp > env.ts)) return;

    entries.set(key, {
      id: env.id,
      author,
      timestamp: env.ts,
      data: fromWire(env.body),
      label: typeof env.label === 'string' ? env.label : undefined,
    });
    dirty = true;
    lastArrival = Date.now();
    notify();
  };

  const start = () => {
    if (!inHost || subscription || starting) return starting;
    starting = getClient()
      .then((statements) => {
        if (listeners.size === 0) return;
        subscription = statements.subscribe(merge, { topic2 });
        live = true;
        notify();
      })
      .catch((err) => console.warn(`[live] topic "${topic}" unavailable:`, err))
      .finally(() => {
        starting = null;
      });
    return starting;
  };

  const stop = () => {
    subscription?.unsubscribe();
    subscription = null;
    live = false;
  };

  return {
    subscribe(cb) {
      listeners.add(cb);
      cb(getSnapshot());
      void start();
      return () => {
        listeners.delete(cb);
        if (listeners.size === 0) stop();
      };
    },

    isLive: () => live,

    async selfAuthor() {
      if (signerAddress) return signerAddress;
      return (await resolveIdentity(false))?.address ?? null;
    },

    async list() {
      if (!inHost) return [];
      const hold = () => {};
      listeners.add(hold);
      await start();
      const began = Date.now();
      await new Promise((resolve) => {
        const poll = setInterval(() => {
          const quiet = Date.now() - Math.max(lastArrival, began) >= HISTORY_SETTLE_MS;
          if (quiet || Date.now() - began >= HISTORY_TIMEOUT_MS) {
            clearInterval(poll);
            resolve(undefined);
          }
        }, 250);
      });
      listeners.delete(hold);
      if (listeners.size === 0) stop();
      return [...getSnapshot()];
    },

    async submit(data, opts = {}) {
      if (!inHost) {
        if (!warnedNoHost) {
          warnedNoHost = true;
          console.warn(`[live] submit on topic "${topic}" skipped — not running inside a Polkadot host.`);
        }
        return;
      }

      const interactive = opts.interactive !== false;
      const self = await resolveIdentity(interactive);
      if (!self) {
        if (!interactive) return;
        throw new Error('No host account session — sign in to the Polkadot app to publish live updates.');
      }

      await ensureStatementAllowance({ account: self.address }).catch(() => {});

      const envelope = { v: 1, id: randomId(), ts: Date.now(), label: self.label, body: toWire(data) };
      const optimistic = opts.channel ? `own:c:${opts.channel}` : `own:${envelope.id}`;
      published.set(envelope.id, optimistic);
      const statements = await getClient();
      const result = await statements.publish(envelope, {
        topic2,
        channel: opts.channel,
        ttlSeconds: opts.ttlSeconds,
      });
      if (result.ok === false) {
        published.delete(envelope.id);
        throw result.error;
      }

      entries.set(optimistic, {
        id: envelope.id,
        author: signerAddress ?? self.address,
        timestamp: envelope.ts,
        data,
        label: self.label,
      });
      dirty = true;
      notify();
    },
  };
}
