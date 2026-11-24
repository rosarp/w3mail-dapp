import { lineGeometry } from '../charts.js';

/** Alpine data `sparkline`, the behaviour of `ui/Sparkline.astro`. */
export const sparkline = (source, { width, height, pad }) => ({
  get values() {
    const value = typeof source === 'function' ? source() : source;
    return Array.isArray(value) ? value.map(Number) : [];
  },
  get geometry() {
    return lineGeometry(this.values, width, height, { padX: pad, padY: pad });
  },
  get up() {
    const v = this.values;
    return v.length > 1 && v[v.length - 1] >= v[0];
  },
  get tone() {
    return this.geometry ? (this.up ? 'text-success' : 'text-danger') : 'text-fg-subtle';
  },
  get ariaLabel() {
    return this.geometry ? `Trend ${this.up ? 'up' : 'down'}` : 'No trend data yet';
  },
});
