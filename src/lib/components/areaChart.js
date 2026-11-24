import { lineGeometry, formatValue } from '../charts.js';

/** Alpine data `areaChart`, the behaviour of `ui/AreaChart.astro`. */
export const areaChart = (source, { format, width, height }) => ({
  hover: null,

  get series() {
    const value = typeof source === 'function' ? source() : source;
    return Array.isArray(value) ? value : [];
  },
  get geometry() {
    return lineGeometry(this.series.map((p) => Number(p.value)), width, height, { padY: 8 });
  },
  get hoverPoint() {
    return this.hover == null ? null : this.geometry?.points[this.hover] ?? null;
  },
  get hoverLeft() {
    return `${Math.min(92, Math.max(8, ((this.hoverPoint?.x ?? 0) / width) * 100))}%`;
  },
  get hoverValue() {
    return this.hover == null ? '' : formatValue(format, this.series[this.hover]?.value);
  },
  get hoverLabel() {
    return this.hover == null ? '' : this.series[this.hover]?.label ?? '';
  },

  hoverAt(event) {
    const count = this.series.length;
    if (count < 2) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    this.hover = Math.max(0, Math.min(count - 1, Math.round(ratio * (count - 1))));
  },
});
