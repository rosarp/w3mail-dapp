import { presence } from '../live/presence.js';

/** Alpine data `presenceAvatars`, the behaviour of `live/PresenceAvatars.astro`. */
export function presenceAvatars(room = '', max = 5) {
  return presence(room, { max });
}
