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
  const maxValue = Math.max(...values);

  // Anchored at zero rather than at the minimum: for a closure-risk chart the
  // distance to zero is the point, and a min-anchored axis would make a school
  // going 40 -> 38 look as dramatic as one going 40 -> 0.
  const span = maxValue > 0 ? maxValue : 1;
  const yearSpan = maxYear - minYear || 1;

  const x = (year) => ((year - minYear) / yearSpan) * width;
  const y = (value) => height - (Math.max(value, 0) / span) * height;

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
    /** True once the curve reaches zero, which is the outcome worth flagging. */
    reachesZero: values.some((value) => value <= 0),
  };
};

/** Formats sparkline points as an SVG polyline `points` attribute. */
export const toPolyline = (points) =>
  points.map(([px, py]) => `${px.toFixed(2)},${py.toFixed(2)}`).join(' ');
