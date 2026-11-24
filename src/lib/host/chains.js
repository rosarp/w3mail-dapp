import { SITE } from '../site.js';

/**
 * Each network's descriptor, loaded on first use so a build fetches only the one its
 * chain needs. `paseo-asset-hub` is the public network, from
 * `@parity/product-sdk-descriptors`; `local` is the development chain `dapp-factory chain
 * up` runs, from the project's generated `@polkadot-api/descriptors` in `.papi/`.
 *
 * @type {Record<string, () => Promise<import('polkadot-api').ChainDefinition>>}
 */
const DESCRIPTORS = {
  'paseo-asset-hub': () =>
    import('@parity/product-sdk-descriptors/paseo-asset-hub').then((m) => m['paseo-asset-hub'.replaceAll('-', '_')]),
  local: () => import('@polkadot-api/descriptors').then((m) => m.local),
};

/**
 * The descriptor for this app's chain, `SITE.chain`. The host owns every RPC connection
 * and routes it by the descriptor's genesis hash; the app only names a chain.
 *
 * @returns {Promise<import('polkadot-api').ChainDefinition>}
 */
export function chainDescriptor() {
  const load = DESCRIPTORS[SITE.chain];
  if (!load) return Promise.reject(new Error(`No descriptor for chain ${SITE.chain}`));
  return load();
}
