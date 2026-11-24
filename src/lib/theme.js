/**
 * @typedef {object} Tokens
 * @property {'light' | 'dark'} mode
 * @property {string} surface
 * @property {string} surface2
 * @property {string} border
 * @property {string} fg
 * @property {string} muted
 * @property {string} subtle
 * @property {string} primary
 * @property {string} label
 * @property {string} grid
 * @property {string} axis
 * @property {string[]} series
 */

/**
 * The live design tokens from global.css, so script-drawn graphics match the theme.
 *
 * @returns {Tokens}
 */
export function readTokens() {
  const root = document.documentElement;
  const css = getComputedStyle(root);
  const get = (/** @type {string} */ name) => css.getPropertyValue(name).trim();
  return {
    mode: root.dataset.theme === 'dark' ? 'dark' : 'light',
    surface: get('--surface'),
    surface2: get('--surface-2'),
    border: get('--border'),
    fg: get('--fg'),
    muted: get('--fg-muted'),
    subtle: get('--fg-subtle'),
    primary: get('--primary'),
    label: get('--chart-label'),
    grid: get('--chart-grid'),
    axis: get('--chart-axis'),
    series: Array.from({ length: 8 }, (_, i) => get(`--series-${i + 1}`)),
  };
}

/**
 * Run `fn` whenever the theme flips.
 *
 * @param {() => void} fn
 * @returns {() => void} Unsubscribe.
 */
export function onThemeChange(fn) {
  window.addEventListener('themechange', fn);
  return () => window.removeEventListener('themechange', fn);
}
