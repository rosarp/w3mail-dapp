import { formatBalance } from '../format.js';

/** Alpine data `balanceDisplay`, the behaviour of `chain/BalanceDisplay.astro`. */
export function balanceDisplay(read = () => 0n, decimals = 10, symbol = 'PAS') {
  return {
    get text() {
      const value = read();
      return formatBalance(typeof value === 'bigint' ? value : 0n, decimals, symbol);
    },
  };
}
