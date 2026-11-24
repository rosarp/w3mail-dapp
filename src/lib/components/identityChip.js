import { displayName } from '../identity.js';

/** Alpine data `identityChip`, the behaviour of `ui/IdentityChip.astro`. */
export function identityChip(readAddress = () => '', readName = () => '', readSelf = () => '', words = {}) {
  return {
    get address() {
      return String(readAddress() ?? '');
    },
    get label() {
      return displayName(this.address, { name: readName(), self: readSelf(), words });
    },
  };
}
