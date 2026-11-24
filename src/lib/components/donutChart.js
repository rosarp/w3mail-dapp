import { donutSlices, formatValue } from '../charts.js';

/** Alpine data `donutChart`, the behaviour of `ui/DonutChart.astro`. */
export const donutChart = (source, { format, centerValue }) => ({
  get ring() {
    return donutSlices(typeof source === 'function' ? source() : source);
  },
  get center() {
    return centerValue ?? formatValue(format, this.ring.total);
  },
  formatted(value) {
    return formatValue(format, value);
  },
});
