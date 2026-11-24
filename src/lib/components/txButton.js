import { component } from '../component.js';
import { txStore } from '../stores.js';
import { contractErrorMessage } from '../contracts.js';

/** Alpine data `txButton`, the behaviour of `ui/TxButton.astro`. */
export function txButton(run, opts) {
  return component({
    busy: false,

    async send() {
      if (this.busy) return;
      this.busy = true;
      const tx = txStore();
      const id = tx.pending(opts.title, opts.pendingMessage);
      try {
        const result = await run();
        const txHash = typeof result === 'string' ? result : result?.txHash;
        tx.confirmed(id, {
          message: opts.successMessage,
          explorerUrl: txHash && opts.explorerBaseUrl ? `${opts.explorerBaseUrl}/tx/${txHash}` : undefined,
        });
        this.$dispatch('tx-confirmed', result);
      } catch (err) {
        tx.failed(id, contractErrorMessage(err));
        this.$dispatch('tx-failed', err);
      } finally {
        this.busy = false;
      }
    },
  });
}
