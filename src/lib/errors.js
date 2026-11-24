/**
 * Surface errors nothing caught as a toast, once per distinct message. An MPA has no
 * component tree to unmount, so this stands in for an error boundary: the page stays up
 * and the user learns something failed.
 *
 * @param {() => import('./toasts.js').ToastStore} toasts
 */
export function reportUncaught(toasts) {
  const seen = new Set();
  const report = (/** @type {unknown} */ reason) => {
    const message = reason instanceof Error ? reason.message : String(reason ?? 'Unknown error');
    if (seen.has(message)) return;
    seen.add(message);
    toasts().push({ title: 'Something went wrong', message, tone: 'danger', timeout: 8000 });
  };
  window.addEventListener('error', (event) => report(event.error ?? event.message));
  window.addEventListener('unhandledrejection', (event) => report(event.reason));
}
