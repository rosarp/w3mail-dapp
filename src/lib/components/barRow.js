import { formatValue } from '../charts.js';

/** Alpine data `barRow`, the behaviour of `ui/BarRow.astro`. */
export const barRow = (source, { max, format }) => ({
  shown: false,

  init() {
    requestAnimationFrame(() => requestAnimationFrame(() => (this.shown = true)));
  },

  get rows() {
    const value = typeof source === 'function' ? source() : source;
    const list = Array.isArray(value) ? value : [];
    const ceiling = max ?? Math.max(...list.map((i) => Number(i.value) || 0), 1);
    return list.map((item) => ({
      ...item,
      formatted: formatValue(format, item.value),
      width: `${Math.min(100, ((Number(item.value) || 0) / ceiling) * 100)}%`,
    }));
  },
});
