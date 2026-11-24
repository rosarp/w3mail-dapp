import { requestResourceAllocation } from '@parity/product-sdk-host';
import { isInHost } from './detection.js';

/**
 * Host resource allowances (RFC-0010), claimed through `@parity/product-sdk-host`: a
 * one-time approval that lets the host sponsor work for the product account, so the
 * user never funds it by hand.
 *
 * - `SmartContractAllowance` — the host pays PGAS gas for Revive contract calls.
 * - `BulletinAllowance` — the host signs and pays for Bulletin Chain uploads.
 * - `StatementStoreAllowance` — the host writes to the Statement Store for the user.
 *
 * Distinct from the `ChainSubmit` permission, which only lets the host broadcast. A
 * contract write wants both. Claim lazily, right before the first action that needs
 * it; a read-only visitor must never see a prompt.
 *
 * @typedef {'SmartContractAllowance' | 'BulletinAllowance' | 'StatementStoreAllowance'} AllowanceTag
 *
 * @typedef {object} ClaimOptions
 * @property {number} [derivationIndex]  Product account derivation index, default 0.
 * @property {string} [account]  Scopes the cached grant to one account.
 *
 * @typedef {object} ClaimResult
 * @property {boolean} ok  Every requested allowance is granted.
 * @property {boolean} skipped  Outside a host there is nothing to claim.
 * @property {AllowanceTag[]} denied
 */

/** PGAS is the host-sponsored gas asset; a positive balance means the allowance is live. */
export const PGAS_ASSET_ID = 2_000_000_000;

/** @param {AllowanceTag} tag @param {string} [account] */
const cacheKey = (tag, account) => `host.allowance.${account ?? 'default'}.${tag}`;

/** @param {AllowanceTag} tag @param {string} [account] */
function isCached(tag, account) {
  try {
    return localStorage.getItem(cacheKey(tag, account)) === 'granted';
  } catch {
    return false;
  }
}

/** @param {AllowanceTag} tag @param {string} [account] */
function markCached(tag, account) {
  try {
    localStorage.setItem(cacheKey(tag, account), 'granted');
  } catch {}
}

/**
 * Forget a cached grant so the next action claims again.
 *
 * @param {AllowanceTag} tag
 * @param {string} [account]
 */
export function clearAllowanceCache(tag, account) {
  try {
    localStorage.removeItem(cacheKey(tag, account));
  } catch {}
}

/**
 * @param {AllowanceTag} tag
 * @param {number} derivationIndex
 * @returns {import('@parity/product-sdk-host').AllocatableResource}
 */
function resource(tag, derivationIndex) {
  return tag === 'SmartContractAllowance'
    ? { tag, value: { tag: 'Index', value: derivationIndex } }
    : { tag, value: undefined };
}

/** @type {Map<string, Promise<ClaimResult>>} */
const inFlight = new Map();

/**
 * Claim host allowances. Idempotent — cached grants are skipped — and concurrency-safe:
 * the host services one approval prompt at a time, so parallel claims for the same set
 * share a single prompt.
 *
 * @param {AllowanceTag[]} tags
 * @param {ClaimOptions} [opts]
 * @returns {Promise<ClaimResult>}
 */
export async function claimHostAllowances(tags, opts = {}) {
  if (!isInHost()) return { ok: true, skipped: true, denied: [] };

  const { derivationIndex = 0, account } = opts;
  const pending = tags.filter((t) => !isCached(t, account));
  if (pending.length === 0) return { ok: true, skipped: false, denied: [] };

  const key = `${account ?? 'default'}|${[...pending].sort().join(',')}`;
  const existing = inFlight.get(key);
  if (existing) return existing;

  const claim = (async () => {
    /** @type {Awaited<ReturnType<typeof requestResourceAllocation>>} */
    let result;
    try {
      result = await requestResourceAllocation(pending.map((t) => resource(t, derivationIndex)));
    } catch (err) {
      console.warn('[allowances] requestResourceAllocation threw:', err);
      return { ok: false, skipped: false, denied: pending };
    }
    if (result.ok === false) {
      console.warn('[allowances] requestResourceAllocation error:', result.error);
      return { ok: false, skipped: false, denied: pending };
    }

    /** @type {AllowanceTag[]} */
    const denied = [];
    pending.forEach((tag, i) => {
      if (result.value[i] === 'Allocated') markCached(tag, account);
      else denied.push(tag);
    });
    return { ok: denied.length === 0, skipped: false, denied };
  })();

  inFlight.set(key, claim);
  try {
    return await claim;
  } finally {
    inFlight.delete(key);
  }
}

/** @param {ClaimOptions} [opts] */
export const ensureContractAllowance = (opts) => claimHostAllowances(['SmartContractAllowance'], opts);

/** @param {ClaimOptions} [opts] */
export const ensureBulletinAllowance = (opts) => claimHostAllowances(['BulletinAllowance'], opts);

/** @param {ClaimOptions} [opts] */
export const ensureStatementAllowance = (opts) => claimHostAllowances(['StatementStoreAllowance'], opts);

/**
 * Whether the product account holds PGAS, i.e. the contract allowance is live. Never
 * throws.
 *
 * @param {any} api  A PAPI api exposing the Assets pallet.
 * @param {string} productAccount
 * @returns {Promise<boolean>}
 */
export async function checkPgasGranted(api, productAccount) {
  try {
    const acc = await api?.query?.Assets?.Account?.getValue?.(PGAS_ASSET_ID, productAccount);
    return (acc?.balance ?? 0n) > 0n;
  } catch {
    return false;
  }
}
