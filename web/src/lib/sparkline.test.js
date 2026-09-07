import { describe, expect, it } from 'vitest';
import { sparkline, toPolyline } from './sparkline.js';

const curveOf = (values, startYear = 114) =>
  new Map(values.map((value, index) => [startYear + index, value]));

const opts = { width: 100, height: 40 };

describe('sparkline', () => {
  it('returns null when there is nothing to plot', () => {
    expect(sparkline(new Map(), opts)).toBeNull();
    expect(sparkline(curveOf([null, null]), opts)).toBeNull();
  });

  it('returns null for a single point, which is not a trend', () => {
    expect(sparkline(curveOf([50]), opts)).toBeNull();
  });

  it('skips years with no projection', () => {
    const curve = sparkline(new Map([[114, 100], [115, null], [116, 50]]), opts);
    expect(curve.points).toHaveLength(2);
  });

  it('reports the years it actually plotted, not the nominal range', () => {
    // The label reads these out, so a row with leading gaps must not claim to
    // start at 114.
    const curve = sparkline(new Map([[114, null], [115, 80], [116, 40]]), opts);
    expect(curve.firstYear).toBe(115);
    expect(curve.lastYear).toBe(116);
    expect(curve.first).toBe(80);
    expect(curve.last).toBe(40);
  });

  it('spans the full width from first year to last', () => {
    const curve = sparkline(curveOf([100, 75, 50]), opts);
    expect(curve.points.at(0)[0]).toBeCloseTo(0, 5);
    expect(curve.points.at(-1)[0]).toBeCloseTo(100, 5);
  });

  it('anchors the axis at zero, not at the minimum value', () => {
    // 40 -> 38 should look nearly flat. A min-anchored axis would stretch it
    // to the full height and make it look like a collapse.
    const gentle = sparkline(curveOf([40, 38]), opts);
    const drop = gentle.points.at(-1)[1] - gentle.points.at(0)[1];
    expect(drop).toBeLessThan(opts.height / 4);
  });

  it('puts the maximum value at the top and zero at the bottom', () => {
    const curve = sparkline(curveOf([80, 0]), opts);
    expect(curve.points.at(0)[1]).toBeCloseTo(0, 5);
    expect(curve.points.at(-1)[1]).toBeCloseTo(opts.height, 5);
  });

  it('clamps negative projections to the zero baseline', () => {
    const curve = sparkline(curveOf([60, -20]), opts);
    expect(curve.points.at(-1)[1]).toBeCloseTo(opts.height, 5);
  });

  it('survives a curve that is flat at zero', () => {
    const curve = sparkline(curveOf([0, 0]), opts);
    expect(curve.points.every(([, y]) => Number.isFinite(y))).toBe(true);
  });

  it('reports the endpoints and whether the curve reaches zero', () => {
    expect(sparkline(curveOf([90, 45, 0]), opts)).toMatchObject({
      first: 90,
      last: 0,
      maxValue: 90,
      reachesZero: true,
    });
    expect(sparkline(curveOf([90, 80]), opts).reachesZero).toBe(false);
  });

  it('marks the highlighted year on the curve', () => {
    const curve = sparkline(curveOf([100, 50, 0]), { ...opts, highlight: 115 });
    expect(curve.highlighted[0]).toBeCloseTo(50, 5);
    expect(curve.highlighted[1]).toBeCloseTo(opts.height / 2, 5);
  });

  it('omits the marker for a year with no projection', () => {
    expect(sparkline(curveOf([100, 50]), { ...opts, highlight: 130 }).highlighted).toBeNull();
    expect(sparkline(curveOf([100, 50]), opts).highlighted).toBeNull();
  });
});

describe('toPolyline', () => {
  it('formats points for an SVG polyline', () => {
    expect(toPolyline([[0, 40], [50.5, 20.25]])).toBe('0.00,40.00 50.50,20.25');
  });

  it('returns an empty string for no points', () => {
    expect(toPolyline([])).toBe('');
  });
});
