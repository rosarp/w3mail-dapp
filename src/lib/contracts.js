import {
  createContract as createSdkContract,
  ensureContractAccountMapped,
  ContractDryRunFailedError,
  ContractRevertedError,
  QUERY_FALLBACK_ORIGIN,
} from '@parity/product-sdk-contracts';
import { requestPermission } from '@parity/product-sdk-host';
import { TxSigningRejectedError, isSigningRejection } from '@parity/product-sdk-tx';
import { toH160 as deriveH160 } from '@parity/product-sdk-address';
import { getChain } from './chain.js';
import { getSigner, getSignerManager } from './wallet.js';
import { walletStore, faucetStore } from './stores.js';
import { isInsufficientFundsError } from './faucet.js';
import { decodeDryRunError } from './dryRunError.js';
import { ensureContractAllowance } from './host/allowances.js';

/**
 * Reads and writes against a Revive contract through the host, built on
 * `@parity/product-sdk-contracts`: it encodes and decodes the ABI, sizes each call with a
 * dry-run and submits through `@parity/product-sdk-tx`.
 *
 * Domain modules wrap this — `lib/<domain>.js` exports `getListings()`, `buy(id)` — and
 * pages call those, never `createContract` directly.
 *
 * @typedef {object} WriteResult
 * @property {import('@parity/product-sdk-tx').TxResult} receipt  The included transaction.
 * @property {{ logs: any[], [event: string]: any }} eventData  Revive events by type.
 *
 * @typedef {object} Contract
 * @property {(functionName: string, args?: readonly unknown[]) => Promise<any>} read
 *   A view call. Needs no wallet; resolves undefined when the chain cannot originate it.
 *   A function with several outputs resolves to an object keyed by output name.
 * @property {(functionName: string, args?: readonly unknown[], value?: bigint) => Promise<WriteResult>} write
 *   Signs through the host, maps the account first when needed, resolves on best-block
 *   inclusion.
 */

/** @param {unknown} _k @param {unknown} v */
const bigintSafe = (_k, v) => (typeof v === 'bigint' ? v.toString() : v);

/** @param {unknown} value */
const isUnmapped = (value) => JSON.stringify(value ?? null, bigintSafe).includes('AccountUnmapped');

/** @type {Record<string, string>} */
const FRIENDLY = {
  accountunmapped: 'Setting up your account. Please approve both transactions.',
  'insufficient balance': 'Not enough PAS for this transaction.',
  'invalid.payment': 'Not enough PAS for this transaction.',
  outofgas: 'Transaction ran out of gas. Please try again.',
  'out of gas': 'Transaction ran out of gas. Please try again.',
  exhaustsresources: 'Transaction exceeds resource limits. Try a smaller operation.',
};

/**
 * A sentence fit for a toast.
 *
 * @param {unknown} err
 * @returns {string}
 */
export function contractErrorMessage(err) {
  if (err instanceof TxSigningRejectedError || isSigningRejection(err)) return 'Transaction was cancelled.';
  if (err instanceof ContractRevertedError && err.reason) return err.reason;
  const detail =
    err instanceof ContractDryRunFailedError
      ? decodeDryRunError(err.dispatchError)
      : /** @type {{ formatted?: string }} */ (err ?? {}).formatted ?? '';
  const text = `${String(err ?? '')} ${detail}`.toLowerCase();
  for (const [pattern, message] of Object.entries(FRIENDLY)) {
    if (text.includes(pattern)) return message;
  }
  const message = err instanceof Error ? err.message : '';
  if (message.includes('cancelled') || message.includes('rejected')) return 'Transaction was cancelled.';
  return detail || message || 'An unexpected error occurred.';
}

/**
 * Ask the host for gas sponsorship and the ChainSubmit permission. The permission must
 * be requested in-session — merely querying it leaves the broadcast denied after the
 * user has already signed. A dev account pays its own gas: sponsorship is a grant to
 * the product account.
 *
 * @param {string} account
 * @param {import('./wallet.js').WalletMode} mode
 */
async function authorise(account, mode) {
  if (mode !== 'dev') await ensureContractAllowance({ account }).catch(() => {});

  const permission = await requestPermission({ tag: 'ChainSubmit', value: undefined });
  if (permission.ok === false) {
    throw new Error(`Couldn't get permission to submit transactions: ${permission.error.message}`);
  }
  if (!permission.value) {
    throw new Error('This app needs permission to submit transactions. Approve "Sign Transactions" when the host asks, then try again.');
  }
}

/**
 * Revive events from an included transaction, keyed by event type, with every
 * `ContractEmitted` payload in `logs`.
 *
 * @param {readonly any[]} events
 * @returns {WriteResult['eventData']}
 */
function reviveEvents(events) {
  /** @type {WriteResult['eventData']} */
  const eventData = { logs: [] };
  for (const e of events) {
    if (e?.type !== 'Revive') continue;
    eventData[e.value.type] = e.value;
    if (e.value.type === 'ContractEmitted' && e.value.value) eventData.logs.push(e.value.value);
  }
  return eventData;
}

/**
 * @param {import('@parity/product-sdk-contracts').AbiEntry[]} abi
 * @param {string} address  The contract's H160.
 * @returns {Contract}
 */
export function createContract(abi, address) {
  /** @type {Promise<any> | null} */
  let handle = null;
  const contract = () =>
    (handle ??= getChain()
      .then(({ contracts }) =>
        createSdkContract(contracts, /** @type {`0x${string}`} */ (address), abi, {
          signerManager: getSignerManager(),
        }),
      )
      .catch((err) => {
        handle = null;
        throw err;
      }));

  /** @param {string} functionName */
  const method = async (functionName) => {
    const m = (await contract())[functionName];
    if (!m) throw new Error(`${functionName} is not a function in this contract's ABI`);
    return m;
  };

  return {
    async read(functionName, args = []) {
      const m = await method(functionName);
      let result = await m.query(...args);
      if (!result.success && isUnmapped(result.value)) {
        result = await m.query(...args, { origin: QUERY_FALLBACK_ORIGIN });
      }
      if (result.success) return result.value;
      if (isUnmapped(result.value)) return undefined;
      if (result.value?.type === 'ContractRevertedWithPayload') {
        throw new ContractRevertedError(functionName, result.value.data, result.value);
      }
      throw new Error(`Contract read failed: ${functionName}: ${decodeDryRunError(result.value)}`);
    },

    async write(functionName, args = [], value = 0n) {
      const wallet = walletStore();
      try {
        if (!wallet?.address || !wallet.h160) throw new Error('Wallet not connected');
        const signer = getSigner();
        if (!signer) throw new Error('Signer not available');

        await authorise(wallet.address, wallet.mode);

        const { contracts } = await getChain();
        const mapped = await ensureContractAccountMapped(contracts, wallet.address, signer);
        if (mapped.ok === false) throw mapped.error;

        const m = await method(functionName);
        const result = await m.tx(...args, { value, signer, origin: wallet.address });
        if (result.ok === false) throw result.error;

        wallet.refreshBalance();
        return { receipt: result.value, eventData: reviveEvents(result.value.events) };
      } catch (err) {
        if (isInsufficientFundsError(err)) faucetStore()?.prompt();
        throw err;
      }
    },
  };
}

/**
 * The H160 for any address: an H160 passes through lowercased, an SS58 account is
 * derived locally by `@parity/product-sdk-address`.
 *
 * @param {string} input
 * @returns {`0x${string}`}
 */
export function toH160(input) {
  return /** @type {`0x${string}`} */ (deriveH160(input.trim()).toLowerCase());
}
