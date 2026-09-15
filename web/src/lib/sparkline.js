/**
 * Turns a school's 17 projection years into sparkline geometry.
 *
 * The dataset carries the whole 114–130 curve, but the popup only ever showed
 * the one year the slider happened to sit on. A single number cannot tell you
 * whether a school is sliding gently or falling off a cliff, which is the
 * actual question this project exists to answer.
 *
 * Pure and DOM-free so the shape of the curve can be tested directly.
 */

/**
 * @param projections Map of year -> headcount (may contain nulls)
 * @param width       viewBox width
 * @param height      viewBox height
 * @returns `null` when there is nothing to draw, otherwise the polyline
 *          points, the highlighted year's dot, and the value range.
 */
export const sparkline = (projections, { width = 120, height = 32, highlight } = {}) => {
  const entries = [...projections.entries()].filter(([, value]) => value != null);
  if (entries.length < 2) return null;

  const years = entries.map(([year]) => year);
  const values = entries.map(([, value]) => value);

  const minYear = Math.min(...years);
  const maxYear = Math.max(...years);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);

  // Always include zero in the visible range so the distance-to-zero stays
  // visually meaningful.  For positive-only curves lo === 0, which preserves
  // the original zero-anchored axis.  For curves that dip below zero the axis
  // extends downward so negative values render below a visible zero line.
  const lo = Math.min(minValue, 0);
  const hi = Math.max(maxValue, 0);
  const span = hi - lo || 1;
  const yearSpan = maxYear - minYear || 1;

  const x = (year) => ((year - minYear) / yearSpan) * width;
  const y = (value) => height - ((value - lo) / span) * height;

  const points = entries.map(([year, value]) => [x(year), y(value)]);
  const highlighted =
    highlight != null && projections.get(highlight) != null
      ? [x(highlight), y(projections.get(highlight))]
      : null;

  return {
    points,
    highlighted,
    // The plotted endpoints, which are not always the first and last
    // projection years: rows with gaps get those years skipped entirely.
    firstYear: years.at(0),
    lastYear: years.at(-1),
    first: values.at(0),
    last: values.at(-1),
    maxValue,
    /** SVG y-coordinate of the zero line. */
    zeroY: y(0),
    /** True when any value is negative, signalling the component to draw a zero line. */
    hasNegative: minValue < 0,
    /** True once the curve reaches zero, which is the outcome worth flagging. */
    reachesZero: values.some((value) => value <= 0),
  };
};

/** Formats sparkline points as an SVG polyline `points` attribute. */
export const toPolyline = (points) =>
  points.map(([px, py]) => `${px.toFixed(2)},${py.toFixed(2)}`).join(' ');
