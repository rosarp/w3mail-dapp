/**
 * Display formatting for addresses, balances, counts and times. Pure functions — safe
 * in Astro frontmatter and in Alpine expressions alike.
 */

/**
 * `5Grwv…utQY`-style shortening.
 *
 * @param {string} address
 * @param {number} [start]
 * @param {number} [end]
 */
export function truncateAddress(address, start = 6, end = 4) {
  if (!address) return '';
  if (address.length <= start + end + 3) return address;
  return `${address.slice(0, start)}...${address.slice(-end)}`;
}

/**
 * A planck amount as a decimal string with its symbol. Keeps at least two fractional
 * digits when there is any fraction, and drops trailing zeros.
 *
 * @param {bigint} amount
 * @param {number} [decimals]  10 for native PAS, 18 for EVM tokens.
 * @param {string} [symbol]
 */
export function formatBalance(amount, decimals = 10, symbol = 'PAS') {
  const divisor = 10n ** BigInt(decimals);
  const whole = amount / divisor;
  const fraction = (amount % divisor).toString().padStart(decimals, '0');
  let trimmed = fraction.replace(/0+$/, '');
  if (trimmed.length < 2) trimmed = fraction.slice(0, 2);
  if (trimmed === '00' || trimmed.length === 0) return `${whole} ${symbol}`;
  return `${whole}.${trimmed} ${symbol}`;
}

/**
 * A user-typed amount (`"1.5"`) in the smallest unit, or null when it is not a valid
 * non-negative decimal with at most `decimals` fractional digits.
 *
 * @param {string} value
 * @param {number} [decimals]
 * @returns {bigint | null}
 */
export function parseAmount(value, decimals = 10) {
  const trimmed = value.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  const [whole, frac = ''] = trimmed.split('.');
  if (frac.length > decimals) return null;
  const padded = (frac + '0'.repeat(decimals)).slice(0, decimals);
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(padded || '0');
}

/**
 * `1234` → `1.2K`, `3_400_000` → `3.4M`.
 *
 * @param {number | bigint} value
 * @param {number} [fractionDigits]
 */
export function formatCompact(value, fractionDigits = 1) {
  const n = typeof value === 'bigint' ? Number(value) : value;
  if (!Number.isFinite(n)) return '0';
  const abs = Math.abs(n);
  for (const [threshold, suffix] of /** @type {const} */ ([[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']])) {
    if (abs >= threshold) return `${parseFloat((n / threshold).toFixed(fractionDigits))}${suffix}`;
  }
  return `${n}`;
}

/**
 * A ratio as a percentage: `0.123` → `12.3%`. Pass `basis: 'percent'` for 0–100 input.
 *
 * @param {number} value
 * @param {{ fractionDigits?: number, basis?: 'ratio' | 'percent' }} [options]
 */
export function formatPercent(value, { fractionDigits = 1, basis = 'ratio' } = {}) {
  if (!Number.isFinite(value)) return '0%';
  const pct = basis === 'percent' ? value : value * 100;
  return `${parseFloat(pct.toFixed(fractionDigits))}%`;
}

/**
 * `just now`, `5m ago`, `3h ago`, `2d ago`, then a short date.
 *
 * @param {number | Date | string} input
 * @param {number} [now]
 */
export function timeAgo(input, now = Date.now()) {
  const ts = input instanceof Date ? input.getTime() : typeof input === 'string' ? Date.parse(input) : input;
  if (!Number.isFinite(ts)) return '';
  const s = Math.floor(Math.max(0, now - ts) / 1000);
  if (s < 45) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** @param {number} ms */
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
