import { isDesignPreview } from './host/detection.js';

/**
 * The factory's design review screenshots the app with no chain, so every read comes
 * back empty. Wrap primary lists and hero items so preview renders populated with a
 * small, believable fixture; real users never see it.
 *
 *   const films = previewData(filmsFromChain, SAMPLE_FILMS);
 */

export { isDesignPreview };

/**
 * `sample` in design preview, otherwise `real`.
 *
 * @template T
 * @param {T} real
 * @param {T} sample
 * @returns {T}
 */
export function previewData(real, sample) {
  return isDesignPreview() ? sample : real;
}

/**
 * Like `previewData`, but only replaces an empty `real` (null, undefined, `[]`).
 *
 * @template T
 * @param {T} real
 * @param {T} sample
 * @returns {T}
 */
export function previewFallback(real, sample) {
  if (!isDesignPreview()) return real;
  const empty = real == null || (Array.isArray(real) && real.length === 0);
  return empty ? sample : real;
}
