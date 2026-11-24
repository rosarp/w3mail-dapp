import { SITE } from '../site.js';

/**
 * The descriptor for this app's chain, fixed at scaffold time so the build carries only
 * that chain's metadata. The host owns every RPC connection and routes it by the
 * descriptor's genesis hash; the app only names a chain. `paseo-asset-hub` is Paseo
 * Asset Hub Next, where the factory deploys contracts, from
 * `@parity/product-sdk-descriptors`; `local` is the development chain `dapp-factory chain
 * up` runs, from the project's generated `@polkadot-api/descriptors`. The descriptor
 * loads on first use.
 *
 * @returns {Promise<import('polkadot-api').ChainDefinition>}
 */
export function chainDescriptor() {
  return import('@polkadot-api/descriptors').then((m) => m[SITE.chain.replaceAll('-', '_')]);
}
