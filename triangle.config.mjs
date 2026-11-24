// @ts-check

/**
 * Build settings a Triangle product needs to run inside a Polkadot host — dot.li /
 * paseo.li iframes and the Desktop and Mobile webviews, all serving the app from an
 * IPFS archive.
 *
 * - No inline scripts or styles: a strict host CSP rejects them.
 * - Asset paths stay root-absolute. dot.li injects `<base href="/dotli-app/">` into
 *   sub-pages, which breaks relative paths — so, unlike a Vite SPA, no `base: './'`.
 *
 * @type {import('astro').AstroUserConfig}
 */
export const triangleConfig = {
  build: { inlineStylesheets: 'never' },
  vite: { build: { assetsInlineLimit: 0 } },
};
