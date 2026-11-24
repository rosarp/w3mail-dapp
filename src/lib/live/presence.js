import { createTopicStore } from './statements.js';
import { truncateAddress } from '../format.js';

const HEARTBEAT_MS = 25_000;
const STALE_MS = 60_000;
const PRUNE_TICK_MS = 15_000;

/**
 * @typedef {object} PresencePeer
 * @property {string} id  The peer's author address.
 * @property {string} label  DotNS username, else a truncated address.
 * @property {number} lastSeen  Epoch ms of the latest heartbeat.
 */

/**
 * Alpine data for "who is here right now" in a room. While mounted it publishes a
 * heartbeat every 25s on a channel, so each user keeps exactly one statement; peers are
 * everyone whose heartbeat landed in the last minute. Heartbeats never prompt for a
 * login — they start flowing once the user has a host session.
 *
 *   Alpine.data('lobbyPresence', () => presence('lobby'))
 *
 * @param {string} room
 * @param {{ max?: number }} [opts]  `visible` holds at most `max` peers; `overflow` counts the rest.
 */
export function presence(room, { max = Infinity } = {}) {
  const store = createTopicStore(`presence:${room}`);
  /** @type {Array<() => void>} */
  const cleanup = [];

  return {
    /** @type {ReadonlyArray<import('./statements.js').StatementEntry<{ room: string }>>} */
    entries: [],
    isLive: false,
    now: Date.now(),

    /** @returns {PresencePeer[]} */
    get peers() {
      const latest = new Map();
      for (const entry of this.entries) {
        const prev = latest.get(entry.author);
        if (!prev || entry.timestamp > prev.timestamp) latest.set(entry.author, entry);
      }
      const cutoff = this.now - STALE_MS;
      return [...latest.values()]
        .filter((entry) => entry.timestamp >= cutoff)
        .sort((a, b) => b.timestamp - a.timestamp)
        .map((entry) => ({ id: entry.author, label: entry.label ?? truncateAddress(entry.author), lastSeen: entry.timestamp }));
    },

    get count() {
      return this.peers.length;
    },

    get visible() {
      return this.peers.slice(0, max);
    },

    get overflow() {
      return Math.max(0, this.count - max);
    },

    init() {
      cleanup.push(
        store.subscribe((all) => {
          this.entries = all;
          this.isLive = store.isLive();
        }),
      );

      const beat = () =>
        store
          .submit({ room }, { channel: 'heartbeat', interactive: false })
          .catch((err) => console.warn('[presence] heartbeat failed:', err));
      beat();
      const heartbeat = setInterval(beat, HEARTBEAT_MS);
      const tick = setInterval(() => {
        this.now = Date.now();
      }, PRUNE_TICK_MS);
      cleanup.push(() => clearInterval(heartbeat), () => clearInterval(tick));
    },

    destroy() {
      cleanup.splice(0).forEach((fn) => fn());
    },
  };
}
