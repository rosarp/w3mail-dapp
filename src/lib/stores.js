import Alpine from 'alpinejs';

/**
 * Typed access to the canonical stores from script code. In markup use `$store.*`.
 */

/** @returns {import('./wallet.js').WalletStore} */
export const walletStore = () => /** @type {any} */ (Alpine.store('wallet'));

/** @returns {import('./tx.js').TxStore} */
export const txStore = () => /** @type {any} */ (Alpine.store('tx'));

/** @returns {{ prompt(): void }} */
export const faucetStore = () => /** @type {any} */ (Alpine.store('faucet'));

/** @returns {import('./toasts.js').ToastStore} */
export const toastStore = () => /** @type {any} */ (Alpine.store('toasts'));
