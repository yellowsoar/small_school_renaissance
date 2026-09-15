import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import TrendSparkline from './TrendSparkline.jsx';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Builds a 17-year projection Map (114-130) from a simple array. */
const makeProjections = (values) =>
  new Map(values.map((v, i) => [114 + i, v]));

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('TrendSparkline', () => {
  it('renders an SVG with a polyline for valid projections', () => {
    const projections = makeProjections(
      Array.from({ length: 17 }, (_, i) => 200 - i * 10),
    );

    const { container } = render(
      <TrendSparkline projections={projections} year={120} color="#d7263d" />,
    );

    expect(container.querySelector('svg')).toBeTruthy();
    expect(container.querySelector('polyline')).toBeTruthy();
  });

  it('renders a highlight dot at the selected year', () => {
    const projections = makeProjections(
      Array.from({ length: 17 }, (_, i) => 200 - i * 10),
    );

    const { container } = render(
      <TrendSparkline projections={projections} year={120} color="#d7263d" />,
    );

    const dot = container.querySelector('circle');
    expect(dot).toBeTruthy();
    expect(dot.getAttribute('r')).toBe('3');
  });

  it('returns null when fewer than 2 non-null values exist', () => {
    const projections = makeProjections([100, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null]);

    const { container } = render(
      <TrendSparkline projections={projections} year={114} color="#000" />,
    );

    expect(container.querySelector('svg')).toBeNull();
  });

  it('returns null for an all-null projection map', () => {
    const projections = makeProjections(Array(17).fill(null));

    const { container } = render(
      <TrendSparkline projections={projections} year={120} color="#000" />,
    );

    expect(container.innerHTML).toBe('');
  });

  it('provides an accessible aria-label with trend summary', () => {
    const projections = makeProjections(
      Array.from({ length: 17 }, (_, i) => 200 - i * 10),
    );

    render(
      <TrendSparkline projections={projections} year={120} color="#d7263d" />,
    );

    const svg = screen.getByRole('img');
    const label = svg.getAttribute('aria-label');
    expect(label).toMatch(/114/);
    expect(label).toMatch(/130/);
    expect(label).toMatch(/200/);
    expect(label).toMatch(/40/);
  });

  it('renders year axis labels in the figcaption', () => {
    const projections = makeProjections(
      Array.from({ length: 17 }, (_, i) => 100 - i * 5),
    );

    render(
      <TrendSparkline projections={projections} year={120} color="#000" />,
    );

    expect(screen.getByText('114')).toBeTruthy();
    expect(screen.getByText('130')).toBeTruthy();
  });

  it('draws a zero-line when values go negative', () => {
    const values = Array.from({ length: 17 }, (_, i) => 50 - i * 10);
    const projections = makeProjections(values);

    const { container } = render(
      <TrendSparkline projections={projections} year={120} color="#d7263d" />,
    );

    const lines = container.querySelectorAll('line');
    expect(lines.length).toBe(1);
  });

  it('does not draw a zero-line when all values are positive', () => {
    const projections = makeProjections(
      Array.from({ length: 17 }, (_, i) => 200 - i * 5),
    );

    const { container } = render(
      <TrendSparkline projections={projections} year={120} color="#000" />,
    );

    expect(container.querySelector('line')).toBeNull();
  });

  it('applies the provided stroke color', () => {
    const projections = makeProjections(
      Array.from({ length: 17 }, (_, i) => 200 - i * 10),
    );

    const { container } = render(
      <TrendSparkline projections={projections} year={120} color="#f07300" />,
    );

    const polyline = container.querySelector('polyline');
    expect(polyline.getAttribute('stroke')).toBe('#f07300');
  });
});
