import { createChainClient } from '@parity/product-sdk-chain-client';
import { createContractRuntimeFromClient, isContractAccountMapped } from '@parity/product-sdk-contracts';
import { ss58ToH160 as deriveH160 } from '@parity/product-sdk-address';
import { chainDescriptor } from './host/chains.js';
import { isInHost, isDesignPreview } from './host/detection.js';

/**
 * The one chain client for this app, from `@parity/product-sdk-chain-client`. All chain
 * access is routed through the host: the host owns the RPC connection and the app never
 * opens a WebSocket of its own. Outside a host every call rejects, and the UI shows its
 * designed empty states.
 *
 * @typedef {object} Chain
 * @property {import('polkadot-api').PolkadotClient} client
 * @property {any} api  The unsafe API: no compatibility checks, so a runtime upgrade
 *   ahead of the pinned descriptor never breaks a read.
 * @property {any} typedApi  The typed API for the app's chain descriptor.
 * @property {import('@parity/product-sdk-contracts').ContractRuntime} contracts
 *   The Revive runtime every contract handle shares.
 */

/** @type {Chain | null} */
let instance = null;
/** @type {Promise<Chain> | null} */
let pending = null;
/** @type {(() => void) | null} */
let release = null;

async function connect() {
  if (isDesignPreview()) {
    throw new Error('Design preview — chain access is disabled.');
  }
  if (!isInHost()) {
    throw new Error('Not inside a host. Open this app in the Polkadot host to reach the chain.');
  }
  const descriptor = await chainDescriptor();
  const chain = await createChainClient({ chains: { app: descriptor } });
  const client = chain.raw.app;
  release = chain.destroy;
  instance = {
    client,
    api: client.getUnsafeApi(),
    typedApi: chain.app,
    contracts: createContractRuntimeFromClient(client, descriptor),
  };
  return instance;
}

/**
 * The chain client, connecting on first use. Concurrent callers share one attempt; a
 * failed attempt is forgotten so a later call retries.
 *
 * @returns {Promise<Chain>}
 */
export function getChain() {
  if (instance) return Promise.resolve(instance);
  pending ??= connect().catch((err) => {
    pending = null;
    throw err;
  });
  return pending;
}

/** Whether the client has connected. */
export function isChainReady() {
  return instance !== null;
}

/** Release this app's hold on the chain. */
export function disconnectChain() {
  release?.();
  release = null;
  instance = null;
  pending = null;
}

/**
 * Run `callback` on every new best block.
 *
 * @param {(blockNumber: number) => void} callback
 * @param {{ minIntervalMs?: number }} [options]  Skip blocks that arrive faster than this.
 * @returns {() => void} Unsubscribe.
 */
export function onBlock(callback, { minIntervalMs = 0 } = {}) {
  let last = 0;
  let cancelled = false;
  /** @type {{ unsubscribe(): void } | null} */
  let subscription = null;

  getChain()
    .then(({ client }) => {
      if (cancelled) return;
      subscription = client.bestBlocks$.subscribe((blocks) => {
        const now = Date.now();
        if (now - last < minIntervalMs) return;
        last = now;
        callback(blocks[0]?.number ?? 0);
      });
    })
    .catch(() => {});

  return () => {
    cancelled = true;
    subscription?.unsubscribe();
  };
}

/**
 * The H160 (EVM) address of an SS58 account, derived locally by
 * `@parity/product-sdk-address`.
 *
 * @param {string} ss58
 * @returns {`0x${string}`}
 */
export function ss58ToH160(ss58) {
  return /** @type {`0x${string}`} */ (deriveH160(ss58).toLowerCase());
}

/**
 * Whether an SS58 account is mapped into the Revive EVM layer.
 *
 * @param {string} address
 * @returns {Promise<boolean>}
 */
export async function isAccountMapped(address) {
  const { contracts } = await getChain();
  const result = await isContractAccountMapped(contracts, address);
  if (result.ok === false) throw result.error;
  return result.value;
}
