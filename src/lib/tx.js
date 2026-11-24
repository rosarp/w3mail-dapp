/**
 * In-flight transactions, rendered by `TxToaster`. Every write goes through here so the
 * user always sees pending → confirmed / failed; never `alert()`.
 *
 *   await $store.tx.track('Minting', () => nft.write('mint', [uri]))
 *
 * @typedef {'pending' | 'confirmed' | 'failed'} TxStatus
 *
 * @typedef {object} TxEntry
 * @property {string} id
 * @property {TxStatus} status
 * @property {string} title
 * @property {string} [message]
 * @property {string} [explorerUrl]
 *
 * @typedef {object} TxStore
 * @property {TxEntry[]} items
 * @property {(title: string, message?: string) => string} pending  Returns the entry id.
 * @property {(id: string, opts?: { message?: string, explorerUrl?: string }) => void} confirmed
 * @property {(id: string, message?: string) => void} failed
 * @property {(id: string) => void} dismiss
 * @property {<T>(title: string, run: () => Promise<T>) => Promise<T>} track
 *   Wraps `run` in a pending entry, resolving it to confirmed or failed. Rethrows.
 * @property {(id: string, patch: Partial<TxEntry>) => void} update
 */

/**
 * @param {(err: unknown) => string} describe  Turns a failure into a sentence.
 * @returns {TxStore}
 */
export function createTxStore(describe) {
  let seq = 0;
  return {
    items: [],

    pending(title, message) {
      const id = `tx-${++seq}`;
      this.items.push({ id, status: 'pending', title, message });
      return id;
    },

    confirmed(id, opts = {}) {
      this.update(id, { status: 'confirmed', message: opts.message ?? 'Transaction confirmed', explorerUrl: opts.explorerUrl });
      setTimeout(() => this.dismiss(id), 6000);
    },

    failed(id, message) {
      this.update(id, { status: 'failed', message: message ?? 'Transaction failed' });
      setTimeout(() => this.dismiss(id), 8000);
    },

    dismiss(id) {
      this.items = this.items.filter((t) => t.id !== id);
    },

    async track(title, run) {
      const id = this.pending(title);
      try {
        const result = await run();
        this.confirmed(id);
        return result;
      } catch (err) {
        this.failed(id, describe(err));
        throw err;
      }
    },

    /** @param {string} id @param {Partial<TxEntry>} patch */
    update(id, patch) {
      this.items = this.items.map((t) => (t.id === id ? { ...t, ...patch } : t));
    },
  };
}
