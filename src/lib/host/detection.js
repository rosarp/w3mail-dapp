/**
 * Whether the app is running inside a Polkadot host: a host webview, a `*.paseo.li` /
 * `*.dot.li` viewer domain, or an iframe embed.
 *
 * @returns {boolean}
 */
export function isInHost() {
  if (typeof window === 'undefined') return false;
  if (/** @type {any} */ (window).__HOST_WEBVIEW_MARK__) return true;
  const host = window.location.hostname;
  if (host.endsWith('.paseo.li') || host.endsWith('.dot.li')) return true;
  try {
    return window !== window.top;
  } catch {
    return true;
  }
}

/**
 * Whether the factory's design-review harness is rendering the app without a host. In
 * that mode the wallet reports a stub account and chain access stays off.
 *
 * @returns {boolean}
 */
export function isDesignPreview() {
  return typeof window !== 'undefined' && /** @type {any} */ (window).__DESIGN_PREVIEW__ === true;
}

const EXECUTABLE_LABELS = new Set(['app', 'widget']);
const GATEWAY = /^(.+?)(?:\.app)?\.(paseo|dot)\.li$/;

/**
 * The product id the host derives this app's account from, read from where the app is
 * served: `mail.paseo.li` and `mail.app.paseo.li` give `mail.paseo`, `mail.dot.li` gives
 * `mail.dot`, `polkadot://app.mail.paseo` gives `mail.paseo`, and any other host (e.g.
 * `localhost:4321`) is returned as is.
 *
 * @param {{ protocol: string, host: string }} location
 * @returns {string}
 */
export function identifierFor({ protocol, host }) {
  if (protocol === 'polkadot:') {
    const labels = host.split('.');
    return labels.length > 2 && EXECUTABLE_LABELS.has(labels[0]) ? labels.slice(1).join('.') : host;
  }
  const gateway = host.match(GATEWAY);
  if (gateway) return `${gateway[1]}.${gateway[2]}`;
  return host;
}

/**
 * The product id the host derives this app's account from. The factory sets
 * `PUBLIC_PRODUCT_ID` (`<domain>.paseo`) for previews and builds, so the app has the
 * same account locally and published; without it, the id comes from the location.
 *
 * @returns {string}
 */
export function productIdentifier() {
  if (typeof window === 'undefined') return '';
  return import.meta.env.PUBLIC_PRODUCT_ID || identifierFor(window.location);
}
