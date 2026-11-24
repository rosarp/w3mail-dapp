import { getHostLocalStorage } from '@parity/product-sdk-host';
import { isDesignPreview, isInHost } from './host/detection.js';

/**
 * @typedef {object} Backend
 * @property {(key: string) => Promise<unknown>} readJSON  `null` for a missing key.
 * @property {(key: string, value: unknown) => Promise<void>} writeJSON
 * @property {(key: string) => Promise<void>} clear
 */

/** @type {Promise<Backend> | null} */
let backend = null;

/** @type {Map<string, unknown>} */
const memory = new Map();

/** @type {Backend} */
const memoryBackend = {
  readJSON: async (key) => (memory.has(key) ? structuredClone(memory.get(key)) : null),
  writeJSON: async (key, value) => {
    memory.set(key, structuredClone(value));
  },
  clear: async (key) => {
    memory.delete(key);
  },
};

/** @returns {Promise<Backend>} */
function storage() {
  if (!backend) {
    backend = (async () => {
      if (isDesignPreview() || !isInHost()) return memoryBackend;
      const host = await getHostLocalStorage();
      if (!host) throw new Error('The host has no storage for this app');
      return host;
    })();
    backend.catch(() => {
      backend = null;
    });
  }
  return backend;
}

/** @type {Map<string, Promise<unknown>>} */
const queues = new Map();

/**
 * @template T
 * @param {string} name
 * @param {() => Promise<T>} work
 * @returns {Promise<T>}
 */
function serialised(name, work) {
  const previous = queues.get(name) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(work);
  queues.set(name, next);
  return next;
}

/** @param {unknown} error */
function storageError(error) {
  const text = String(/** @type {any} */ (error)?.message ?? /** @type {any} */ (error)?.tag ?? error);
  return /full/i.test(text) ? new Error('Device storage is full', { cause: error }) : error;
}

/**
 * @template T
 * @param {() => Promise<T>} work
 * @returns {Promise<T>}
 */
async function mapped(work) {
  try {
    return await work();
  } catch (error) {
    throw storageError(error);
  }
}

/**
 * A named collection of JSON records that survives host restarts. Inside a host it
 * lives in the host's storage for this app; the webview's own `localStorage` is not
 * kept across Desktop restarts. Outside a host and in design preview it lives in
 * memory, so previews and QA work.
 *
 * Writes to one collection run one at a time, in call order.
 *
 * @template [T=unknown]
 * @param {string} name
 */
export function openCollection(name) {
  const indexKey = `c:${name}:ids`;
  /** @param {string} id */
  const recordKey = (id) => `c:${name}:r:${id}`;

  /** @returns {Promise<string[]>} */
  const readIds = async () => {
    const ids = await (await storage()).readJSON(indexKey);
    return Array.isArray(ids) ? ids : [];
  };

  return {
    /** @returns {Promise<string[]>} */
    ids: () => mapped(readIds),

    /**
     * @param {string} id
     * @returns {Promise<T | null>}
     */
    get: (id) => mapped(async () => /** @type {T | null} */ ((await (await storage()).readJSON(recordKey(id))) ?? null)),

    /** @returns {Promise<T[]>} */
    all: () =>
      mapped(async () => {
        const store = await storage();
        const records = await Promise.all((await readIds()).map((id) => store.readJSON(recordKey(id))));
        return /** @type {T[]} */ (records.filter((r) => r !== null && r !== undefined));
      }),

    /**
     * @param {string} id
     * @param {T} value
     */
    put: (id, value) =>
      serialised(name, () =>
        mapped(async () => {
          const store = await storage();
          await store.writeJSON(recordKey(id), value);
          const ids = await readIds();
          if (!ids.includes(id)) await store.writeJSON(indexKey, [...ids, id]);
        }),
      ),

    /** @param {string} id */
    remove: (id) =>
      serialised(name, () =>
        mapped(async () => {
          const store = await storage();
          const ids = await readIds();
          if (ids.includes(id)) await store.writeJSON(indexKey, ids.filter((x) => x !== id));
          await store.clear(recordKey(id));
        }),
      ),

    clear: () =>
      serialised(name, () =>
        mapped(async () => {
          const store = await storage();
          const ids = await readIds();
          await store.writeJSON(indexKey, []);
          await Promise.all(ids.map((id) => store.clear(recordKey(id))));
        }),
      ),
  };
}

/** Forget the chosen backend and the in-memory records. For tests. */
export function resetStore() {
  backend = null;
  memory.clear();
  queues.clear();
}
