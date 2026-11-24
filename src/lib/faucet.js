/**
 * Host product accounts start unfunded, so a first write can fail with
 * `InvalidTransaction::Payment`. The `/wallet/faucet/` page points the user at free
 * test PAS.
 */
export const FAUCET_URL = 'https://faucet.polkadot.io/?parachain=1500';

/**
 * The top-up page, returning to `returnTo` when the user is done.
 *
 * @param {string} returnTo  An in-app path.
 */
export function faucetPage(returnTo) {
  return `/wallet/faucet/?return=${encodeURIComponent(returnTo)}`;
}

/**
 * The in-app path a `?return=` parameter names, or `/`. Anything that is not a
 * same-origin path is ignored.
 *
 * @param {string} search  `location.search`.
 */
export function returnPath(search) {
  const value = new URLSearchParams(search).get('return') ?? '';
  return value.startsWith('/') && !value.startsWith('//') ? value : '/';
}

/**
 * Whether a failure means the signer cannot cover value plus fees, as opposed to a
 * contract revert.
 *
 * @param {unknown} err
 */
export function isInsufficientFundsError(err) {
  const formatted = /** @type {{ formatted?: unknown }} */ (err ?? {}).formatted;
  const s = `${err instanceof Error ? err.message : String(err ?? '')} ${formatted ?? ''}`.toLowerCase();
  return (
    s.includes('rejected: payment') ||
    s.includes('"type":"payment"') ||
    s.includes('inability to pay') ||
    s.includes('not enough pas') ||
    s.includes('invalid.payment') ||
    (s.includes('payment') && s.includes('invalid'))
  );
}
