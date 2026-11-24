import { hash32 } from '../identity.js';
import { truncateAddress } from '../format.js';

/** Alpine data `addressAvatar`, the behaviour of `ui/AddressAvatar.astro`. */
export function addressAvatar(read = () => '', alt = '') {
  return {
    get address() {
      return String(read() ?? '');
    },
    get label() {
      return alt || (this.address ? truncateAddress(this.address, 6, 4) : 'Address avatar');
    },
    get look() {
      const h = hash32(this.address.toLowerCase());
      const base = (h & 0xff) * (360 / 256);
      const hue = (/** @type {number} */ deg) => `hsl(${((base + deg + 360) % 360).toFixed(0)} 68% 56%)`;
      const at = (/** @type {number} */ shift) => 4 + (((h >>> shift) & 0x1f) % 24);
      return {
        id: `av${(h % 100000).toString(36)}`,
        rot: (h >>> 3) % 360,
        c1: hue(0),
        c2: hue(40),
        c3: hue(-50),
        b1x: at(1),
        b1y: at(5),
        b2x: at(9),
        b2y: at(13),
      };
    },
  };
}
