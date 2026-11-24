import { component } from '../component.js';
import { formatBalance, parseAmount } from '../format.js';

/** Alpine data `amountInput`, the behaviour of `ui/AmountInput.astro`. */
export function amountInput(/** @type {number} */ decimals, /** @type {() => bigint | null} */ readMax) {
  return component({
    /** @type {bigint | null} */
    value: null,
    text: '',

    get max() {
      const m = readMax();
      return typeof m === 'bigint' ? m : null;
    },
    get overMax() {
      return this.max != null && this.value != null && this.value > this.max;
    },

    init() {
      if (this.value != null) this.text = this.plain(this.value);
      this.$watch('value', (v) => {
        const typed = parseAmount(this.text, decimals);
        if (v == null && typed == null) return;
        if (v == null) this.text = '';
        else if (typed !== v) this.text = this.plain(v);
      });
    },

    /** @param {HTMLInputElement} el */
    onInput(el) {
      this.text = el.value.replace(/[^0-9.]/g, '');
      el.value = this.text;
      this.value = this.text === '' ? null : parseAmount(this.text, decimals);
    },

    useMax() {
      if (this.max == null) return;
      this.text = this.plain(this.max);
      this.value = this.max;
    },

    /** @param {string} symbol */
    formatMax(symbol) {
      return this.max == null ? '' : formatBalance(this.max, decimals, symbol);
    },

    /** @param {bigint} v */
    plain(v) {
      return formatBalance(v, decimals, '').trim();
    },
  });
}
