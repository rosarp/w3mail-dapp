/**
 * Transient notices, rendered by `Toaster`. For transaction status use `$store.tx`.
 *
 *   $store.toasts.push({ title: 'Saved', message: 'Profile updated', tone: 'success' })
 *
 * @typedef {'info' | 'success' | 'warning' | 'danger'} ToastTone
 *
 * @typedef {object} Toast
 * @property {number} id
 * @property {string} title
 * @property {string} [message]
 * @property {ToastTone} tone
 * @property {ToastLink} [link]
 *
 * @typedef {object} ToastLink  A page the notice points to.
 * @property {string} href
 * @property {string} label
 *
 * @typedef {object} ToastInput
 * @property {string} title
 * @property {string} [message]
 * @property {ToastTone} [tone]  Default `info`.
 * @property {ToastLink} [link]
 * @property {number} [timeout]  Milliseconds; 0 keeps it until dismissed. Default 4000.
 */

export function createToastStore() {
  let seq = 0;
  return {
    /** @type {Toast[]} */
    items: [],
    /** @param {ToastInput} toast */
    push({ timeout = 4000, tone = 'info', ...toast }) {
      const id = ++seq;
      this.items.push({ id, tone, ...toast });
      if (timeout > 0) setTimeout(() => this.dismiss(id), timeout);
    },
    /** @param {number} id */
    dismiss(id) {
      this.items = this.items.filter((t) => t.id !== id);
    },
  };
}

/** @typedef {ReturnType<typeof createToastStore>} ToastStore */
