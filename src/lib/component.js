/**
 * Types an Alpine data object so `this` sees both its own fields and Alpine's magics
 * (`$el`, `$refs`, `$dispatch`, `$watch`, …). Returns `data` unchanged. Needed in
 * `.astro` `<script>` blocks, which are type-checked as TypeScript and so ignore JSDoc
 * on a factory's `this`.
 *
 *   function counter() {
 *     return component({ n: 0, inc() { this.n++; this.$dispatch('changed', this.n); } });
 *   }
 *   Alpine.data('counter', counter);
 *
 * @template T
 * @param {import('alpinejs').AlpineComponent<T>} data
 * @returns {import('alpinejs').AlpineComponent<T>}
 */
export function component(data) {
  return data;
}
