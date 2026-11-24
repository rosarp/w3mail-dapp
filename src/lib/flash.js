import { toastStore } from './stores.js';

const FLASH_KEY = 'w3mail.flash';

/**
 * Queue a toast for the next page, for an action that ends by leaving this one.
 *
 * @param {import('./toasts.js').ToastInput} toast
 */
export function flash(toast) {
  try {
    sessionStorage.setItem(FLASH_KEY, JSON.stringify(toast));
  } catch {
    toastStore().push(toast);
  }
}

/** Alpine store `flash`: shows the toast `flash()` queued, once, when the page starts. */
export function flashStore() {
  return {
    init() {
      let queued = null;
      try {
        queued = sessionStorage.getItem(FLASH_KEY);
        sessionStorage.removeItem(FLASH_KEY);
      } catch {
        return;
      }
      if (!queued) return;
      try {
        toastStore().push(JSON.parse(queued));
      } catch {
        sessionStorage.removeItem(FLASH_KEY);
      }
    },
  };
}
