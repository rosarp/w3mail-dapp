import { formatBalance, formatCompact } from '../format.js';

/** Alpine data `price`, the behaviour of `ui/Price.astro`. */
export function price(read = () => 0, decimals = 10, compact = false) {
  return {
    get text() {
      const value = read();
      if (typeof value === 'number') return compact ? formatCompact(value) : `${value}`;
      let raw;
      try {
        raw = typeof value === 'bigint' ? value : BigInt(value ?? 0);
      } catch {
        raw = 0n;
      }
      const scaled = formatBalance(raw, decimals, '').trim();
      return compact ? formatCompact(parseFloat(scaled)) : scaled;
    },
  };
}
