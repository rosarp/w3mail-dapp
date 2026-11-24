import { createTopicStore } from './statements.js';

const REACTIONS_TOPIC = 'reactions';

/**
 * Alpine data for live emoji reactions on one target. All targets share one topic and
 * subscription; each reaction uses a (target, emoji) channel, so there is exactly one
 * reaction per user, target and emoji. `react()` is optimistic and rolls back on failure.
 * Outside a host `isLive` is false and nothing is published.
 *
 *   <div x-data="reactions(post.id)">… x-text="counts['🔥'] ?? 0" …</div>
 *
 * @param {string} targetId
 */
export function reactions(targetId) {
  const store = createTopicStore(REACTIONS_TOPIC);
  /** @type {(() => void) | null} */
  let unsubscribe = null;

  return {
    /** @type {ReadonlyArray<import('./statements.js').StatementEntry<{ target: string, emoji: string }>>} */
    entries: [],
    isLive: false,
    /** @type {string | null} */
    self: null,
    /** @type {string[]} */
    pending: [],

    get confirmed() {
      /** @type {Map<string, Set<string>>} */
      const byEmoji = new Map();
      const mine = new Set();
      for (const entry of this.entries) {
        if (!entry.data || entry.data.target !== targetId) continue;
        let authors = byEmoji.get(entry.data.emoji);
        if (!authors) byEmoji.set(entry.data.emoji, (authors = new Set()));
        authors.add(entry.author);
        if (this.self && entry.author === this.self) mine.add(entry.data.emoji);
      }
      /** @type {Record<string, number>} */
      const counts = {};
      for (const [emoji, authors] of byEmoji) counts[emoji] = authors.size;
      return { counts, mine };
    },

    /** emoji → distinct users, optimistic reactions included. @returns {Record<string, number>} */
    get counts() {
      const { counts, mine } = this.confirmed;
      const merged = { ...counts };
      for (const emoji of this.pending) if (!mine.has(emoji)) merged[emoji] = (merged[emoji] ?? 0) + 1;
      return merged;
    },

    /** Emojis the viewer has reacted with. @returns {string[]} */
    get mine() {
      return [...new Set([...this.confirmed.mine, ...this.pending])];
    },

    init() {
      unsubscribe = store.subscribe((all) => {
        this.entries = all;
        this.isLive = store.isLive();
        const { mine } = this.confirmed;
        if (this.pending.some((e) => mine.has(e))) this.pending = this.pending.filter((e) => !mine.has(e));
      });
      store
        .selfAuthor()
        .then((address) => {
          if (address) this.self = address;
        })
        .catch(() => {});
    },

    destroy() {
      unsubscribe?.();
    },

    /** @param {string} emoji */
    async react(emoji) {
      if (!this.pending.includes(emoji)) this.pending = [...this.pending, emoji];
      try {
        await store.submit({ target: targetId, emoji }, { channel: `react:${targetId}:${emoji}` });
        const address = await store.selfAuthor();
        if (address) this.self = address;
      } catch (err) {
        this.pending = this.pending.filter((e) => e !== emoji);
        console.warn('[reactions] react failed:', err);
      }
    },
  };
}
