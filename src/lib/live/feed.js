import { createTopicStore } from './statements.js';

/**
 * Alpine data for a live cross-user feed on one topic, newest first. Outside a host
 * `entries` stays empty and `publish` is a no-op.
 *
 *   Alpine.data('activity', () => statementFeed('activity'))
 *   <ul x-data="activity"><template x-for="e in entries" :key="e.id">…</template></ul>
 *   await publish({ text: 'gm' })
 *
 * @param {string} topic
 * @param {{ limit?: number }} [opts]  Cap on kept entries, default 50; 0 keeps all.
 */
export function statementFeed(topic, { limit = 50 } = {}) {
  const store = createTopicStore(topic);
  /** @type {(() => void) | null} */
  let unsubscribe = null;

  return {
    /** @type {Array<import('./statements.js').StatementEntry<any>>} */
    entries: [],
    isLive: false,
    /** @type {string | null} */
    error: null,

    init() {
      unsubscribe = store.subscribe((all) => {
        this.entries = limit > 0 ? all.slice(0, limit) : [...all];
        this.isLive = store.isLive();
      });
    },

    destroy() {
      unsubscribe?.();
    },

    /** @param {unknown} data */
    async publish(data) {
      this.error = null;
      try {
        await store.submit(data);
      } catch (err) {
        this.error = err instanceof Error ? err.message : String(err);
      }
    },
  };
}
