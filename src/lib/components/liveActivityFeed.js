import { statementFeed } from '../live/feed.js';
import { timeAgo, truncateAddress } from '../format.js';

/** Alpine data `liveActivityFeed`, the behaviour of `live/LiveActivityFeed.astro`. */
export function liveActivityFeed(topic = '', opts = {}) {
  let tick = null;
  const feed = statementFeed(topic, opts);
  return {
    ...feed,
    now: Date.now(),
    init() {
      feed.init.call(this);
      tick = setInterval(() => {
        this.now = Date.now();
      }, 30_000);
    },
    destroy() {
      feed.destroy.call(this);
      clearInterval(tick);
    },
    truncate: (address) => truncateAddress(address),
    ago(ts) {
      return timeAgo(ts, this.now);
    },
  };
}
