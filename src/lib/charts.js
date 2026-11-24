import * as format from './format.js';

/**
 * Geometry and value formatting shared by the chart components, so a chart drawn at
 * build time and one redrawn by Alpine produce identical paths.
 *
 * @typedef {object} LineGeometry
 * @property {{ x: number, y: number }[]} points
 * @property {string} line  SVG path for the stroke.
 * @property {string} area  SVG path for the fill, closed along the bottom edge.
 *
 * @typedef {object} DonutSegment
 * @property {string} label
 * @property {number} value
 * @property {string} [color]  Any CSS colour, typically a token such as `var(--series-3)`.
 *
 * @typedef {object} DonutSlice
 * @property {string} label
 * @property {number} value
 * @property {number} fraction
 * @property {number} start  Fraction of the ring before this slice.
 * @property {string} color
 */

/**
 * A line and area through `values`, scaled to fill `width` × `height` inside `pad`.
 * Null below two points — callers render their "not enough data" state.
 *
 * @param {number[]} values
 * @param {number} width
 * @param {number} height
 * @param {{ padX?: number, padY?: number }} [pad]
 * @returns {LineGeometry | null}
 */
export function lineGeometry(values, width, height, { padX = 0, padY = 0 } = {}) {
  if (!Array.isArray(values) || values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = (width - padX * 2) / (values.length - 1);
  const points = values.map((v, i) => ({
    x: padX + i * step,
    y: padY + (1 - (v - min) / range) * (height - padY * 2),
  }));
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
  const first = points[0].x.toFixed(2);
  const last = points[points.length - 1].x.toFixed(2);
  return { points, line, area: `${line} L${last},${height} L${first},${height} Z` };
}

const SLICE_COLORS = ['var(--primary)', 'var(--success)', 'var(--warning)', 'var(--danger)', 'var(--fg-subtle)'];

/**
 * Slices of a distribution ring and the `conic-gradient` that draws them.
 *
 * @param {DonutSegment[]} segments
 * @returns {{ total: number, slices: DonutSlice[], background: string }}
 */
export function donutSlices(segments) {
  const list = Array.isArray(segments) ? segments : [];
  const total = list.reduce((sum, s) => sum + (Number(s.value) || 0), 0);
  let cursor = 0;
  const slices = list.map((s, i) => {
    const fraction = total > 0 ? (Number(s.value) || 0) / total : 0;
    const slice = {
      label: s.label,
      value: s.value,
      fraction,
      start: cursor,
      color: s.color ?? SLICE_COLORS[i % SLICE_COLORS.length],
    };
    cursor += fraction;
    return slice;
  });
  const stops = slices
    .filter((s) => s.fraction > 0)
    .map((s) => `${s.color} ${(s.start * 100).toFixed(3)}% ${((s.start + s.fraction) * 100).toFixed(3)}%`);
  const background = stops.length
    ? `conic-gradient(${stops.join(', ')})`
    : 'color-mix(in oklab, var(--fg-subtle) 15%, transparent)';
  return { total, slices, background };
}

/**
 * Format `value` with a named export of `lib/format.js` (`formatCompact`,
 * `formatPercent`, `formatBalance`, `timeAgo`, `truncateAddress`), falling back to
 * `toLocaleString`. Named, because functions cannot cross from Astro props into Alpine.
 *
 * @param {string | undefined} name
 * @param {unknown} value
 * @returns {string}
 */
export function formatValue(name, value) {
  const fn = name ? format[name] : undefined;
  if (typeof fn === 'function') return fn(value);
  if (value == null) return '';
  return typeof value === 'number' || typeof value === 'bigint' ? value.toLocaleString() : String(value);
}
