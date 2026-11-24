import { truncateAddress } from '../format.js';

/** Alpine data `addressDisplay`, the behaviour of `ui/AddressDisplay.astro`. */
export function addressDisplay(read = () => '', start = 6, end = 4) {
  return {
    get address() {
      return String(read() ?? '');
    },
    get short() {
      return truncateAddress(this.address, start, end);
    },
  };
}
