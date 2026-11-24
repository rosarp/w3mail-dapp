/* alpine-plugins:imports:start */
/* alpine-plugins:imports:end */
import { SITE } from './site.js';
import { createToastStore } from './toasts.js';
import { reportUncaught } from './errors.js';
import { faucetPage } from './faucet.js';
import { toastStore } from './stores.js';
import { createWalletStore } from './wallet.js';
import { createTxStore } from './tx.js';
import { contractErrorMessage } from './contracts.js';
import { getChain, onBlock } from './chain.js';
import { isInHost, isDesignPreview } from './host/detection.js';
import { addressAvatar } from './components/addressAvatar.js';
import { addressDisplay } from './components/addressDisplay.js';
import { amountInput } from './components/amountInput.js';
import { areaChart } from './components/areaChart.js';
import { balanceDisplay } from './components/balanceDisplay.js';
import { barRow } from './components/barRow.js';
import { bulletinImageUpload } from './components/bulletinImageUpload.js';
import { copyButton } from './components/copyButton.js';
import { dataTable } from './components/dataTable.js';
import { donutChart } from './components/donutChart.js';
import { identityChip } from './components/identityChip.js';
import { liveActivityFeed } from './components/liveActivityFeed.js';
import { presenceAvatars } from './components/presenceAvatars.js';
import { price } from './components/price.js';
import { reactionBar, burstMagic } from './components/reactionBar.js';
import { reveal } from './components/section.js';
import { sparkline } from './components/sparkline.js';
import { txButton } from './components/txButton.js';
import { mailFolder } from './components/mailFolder.js';
import { flashStore } from './flash.js';

/**
 * Alpine entrypoint, wired in astro.config.mjs. Runs once per page load.
 *
 * Canonical store order — chain, then wallet, then tx — matters: the wallet reads the
 * chain for balances and the tx store reports wallet writes. Add domain stores after
 * `tx`; never reorder or remove the canonical ones.
 *
 * @typedef {'light' | 'dark'} Theme
 * @param {import('alpinejs').Alpine} Alpine
 */
export default (Alpine) => {
  /* alpine-plugins:register:start */
  /* alpine-plugins:register:end */

  Alpine.store('theme', themeStore());
  Alpine.store('toasts', createToastStore());
  Alpine.store('chain', chainStore());
  Alpine.store('wallet', createWalletStore());
  Alpine.store('tx', createTxStore(contractErrorMessage));
  Alpine.store('faucet', {
    prompt() {
      toastStore().push({
        title: 'Not enough PAS',
        message: 'Top up with free test PAS, then try again.',
        tone: 'warning',
        timeout: 0,
        link: { href: faucetPage(window.location.pathname + window.location.search), label: 'Get test PAS' },
      });
    },
  });

  /* domain-stores:start */
  Alpine.store('flash', flashStore());
  /* domain-stores:end */

  registerComponents(Alpine);

  /* domain-components:start */
  Alpine.data('mailFolder', mailFolder);
  /* domain-components:end */

  reportUncaught(() => /** @type {import('./toasts.js').ToastStore} */ (Alpine.store('toasts')));
};


/**
 * Register every reusable component's Alpine data. Registering here, not in each
 * component's own script, makes the behaviour available wherever the markup first
 * renders — including inside `x-if` and `x-for` templates, where scripts never run.
 * Add domain components between the `domain-components` markers.
 *
 * @param {import('alpinejs').Alpine} Alpine
 */
function registerComponents(Alpine) {
  Alpine.data('addressAvatar', addressAvatar);
  Alpine.data('addressDisplay', addressDisplay);
  Alpine.data('amountInput', amountInput);
  Alpine.data('areaChart', areaChart);
  Alpine.data('balanceDisplay', balanceDisplay);
  Alpine.data('barRow', barRow);
  Alpine.data('bulletinImageUpload', bulletinImageUpload);
  Alpine.data('copyButton', copyButton);
  Alpine.data('dataTable', dataTable);
  Alpine.data('donutChart', donutChart);
  Alpine.data('identityChip', identityChip);
  Alpine.data('liveActivityFeed', liveActivityFeed);
  Alpine.data('presenceAvatars', presenceAvatars);
  Alpine.data('price', price);
  Alpine.data('reactionBar', reactionBar);
  Alpine.data('reveal', reveal);
  Alpine.data('sparkline', sparkline);
  Alpine.data('txButton', txButton);
  Alpine.magic('burst', burstMagic);
}

const THEME_KEY = 'theme';

/** @param {Theme} theme */
function applyTheme(theme) {
  const root = document.documentElement;
  root.classList.add('theme-switching');
  root.dataset.theme = theme;
  void root.offsetHeight;
  root.classList.remove('theme-switching');
  window.dispatchEvent(new CustomEvent('themechange', { detail: theme }));
}

function themeStore() {
  return {
    current: /** @type {Theme} */ (document.documentElement.dataset.theme ?? SITE.defaultTheme),
    get isDark() {
      return this.current === 'dark';
    },
    /** @param {Theme} theme */
    set(theme) {
      this.current = theme;
      try {
        localStorage.setItem(THEME_KEY, theme);
      } catch {}
      applyTheme(theme);
    },
    toggle() {
      this.set(this.current === 'dark' ? 'light' : 'dark');
    },
  };
}


/**
 * @typedef {'idle' | 'connecting' | 'ready' | 'unavailable'} ChainStatus
 */
function chainStore() {
  return {
    /** @type {ChainStatus} */
    status: 'idle',
    block: 0,
    /** @type {string | null} */
    error: null,

    init() {
      if (isDesignPreview() || !isInHost()) {
        this.status = 'unavailable';
        return;
      }
      this.status = 'connecting';
      getChain()
        .then(() => {
          this.status = 'ready';
          onBlock((n) => {
            this.block = n;
          });
        })
        .catch((err) => {
          this.status = 'unavailable';
          this.error = err instanceof Error ? err.message : String(err);
        });
    },
  };
}
