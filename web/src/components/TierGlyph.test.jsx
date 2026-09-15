import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import TierGlyph from './TierGlyph.jsx';
import { GLYPH_SIZE, SHAPES } from '../lib/shapes.js';

describe('TierGlyph', () => {
  it('renders an SVG with the correct dimensions', () => {
    const { container } = render(
      <TierGlyph shape="circle" color="#2f9e44" />,
    );

    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg.getAttribute('width')).toBe(String(GLYPH_SIZE));
    expect(svg.getAttribute('height')).toBe(String(GLYPH_SIZE));
  });

  it('respects a custom size prop', () => {
    const { container } = render(
      <TierGlyph shape="circle" color="#2f9e44" size={24} />,
    );

    const svg = container.querySelector('svg');
    expect(svg.getAttribute('width')).toBe('24');
    expect(svg.getAttribute('height')).toBe('24');
  });

  it('applies the fill color to the SVG', () => {
    const { container } = render(
      <TierGlyph shape="triangle" color="#f07300" />,
    );

    const svg = container.querySelector('svg');
    expect(svg.getAttribute('fill')).toBe('#f07300');
  });

  it('renders a <circle> element for circle shape', () => {
    const { container } = render(
      <TierGlyph shape="circle" color="#2f9e44" />,
    );

    const circle = container.querySelector('circle');
    expect(circle).toBeTruthy();
    expect(circle.getAttribute('cx')).toBe(String(SHAPES.circle.attributes.cx));
    expect(circle.getAttribute('cy')).toBe(String(SHAPES.circle.attributes.cy));
    expect(circle.getAttribute('r')).toBe(String(SHAPES.circle.attributes.r));
  });

  it('renders a <rect> element for square shape', () => {
    const { container } = render(
      <TierGlyph shape="square" color="#e5b700" />,
    );

    const rect = container.querySelector('rect');
    expect(rect).toBeTruthy();
    expect(rect.getAttribute('width')).toBe(String(SHAPES.square.attributes.width));
  });

  it('renders a <polygon> for star and triangle shapes', () => {
    for (const shape of ['star7', 'star5', 'triangle']) {
      const { container } = render(
        <TierGlyph shape={shape} color="#d7263d" />,
      );

      const polygon = container.querySelector('polygon');
      expect(polygon, `${shape} should produce a <polygon>`).toBeTruthy();
      expect(polygon.getAttribute('points')).toBe(SHAPES[shape].attributes.points);
    }
  });

  it('falls back to circle for an unknown shape', () => {
    const { container } = render(
      <TierGlyph shape="hexagon" color="#999" />,
    );

    const circle = container.querySelector('circle');
    expect(circle).toBeTruthy();
  });

  it('is aria-hidden so screen readers skip it', () => {
    const { container } = render(
      <TierGlyph shape="circle" color="#2f9e44" />,
    );

    const svg = container.querySelector('svg');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
  });
});
