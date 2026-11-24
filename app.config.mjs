// @ts-check
import alpinejs from '@astrojs/alpinejs';
import tailwindcss from '@tailwindcss/vite';

/**
 * The app's Astro configuration. `astro.config.mjs` builds it as is; the `triangle`
 * layer merges its hosting overrides on top.
 *
 * @type {import('astro').AstroUserConfig}
 */
export const appConfig = {
  trailingSlash: 'always',
  build: { format: 'directory' },

  vite: {
    plugins: [tailwindcss()],
    envPrefix: ['PUBLIC_', 'VITE_'],
    server: { hmr: { overlay: false } },
    optimizeDeps: { entries: ['src/**/*.astro', 'src/lib/alpine.js'] },
    build: { chunkSizeWarningLimit: 1000 },
    clearScreen: false,
  },

  integrations: [alpinejs({ entrypoint: '/src/lib/alpine.js' })],
};
