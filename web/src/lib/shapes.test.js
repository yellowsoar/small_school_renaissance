import { describe, expect, it } from 'vitest';
import { RISK_TIERS } from '../config/index.js';
import { GLYPH_SIZE, SHAPES, shapeFor } from './shapes.js';

const numbers = (points) => points.split(/[ ,]/).map(Number);

describe('shapeFor', () => {
  it('resolves every shape a risk tier asks for', () => {
    for (const tier of RISK_TIERS) {
      expect(SHAPES[tier.shape], `tier ${tier.id} references ${tier.shape}`).toBeDefined();
    }
  });

  it('falls back to a circle for an unknown shape', () => {
    expect(shapeFor('hexagon')).toBe(SHAPES.circle);
    expect(shapeFor(undefined)).toBe(SHAPES.circle);
  });

  it('describes each shape as an element plus attributes', () => {
    for (const [name, shape] of Object.entries(SHAPES)) {
      expect(typeof shape.element, name).toBe('string');
      expect(typeof shape.attributes, name).toBe('object');
    }
  });
});

describe('star geometry', () => {
  it('emits two points per arm', () => {
    expect(numbers(SHAPES.star5.attributes.points)).toHaveLength(20);
    expect(numbers(SHAPES.star7.attributes.points)).toHaveLength(28);
  });

  it('starts at the top of the viewBox', () => {
    const [x, y] = numbers(SHAPES.star5.attributes.points);
    expect(x).toBeCloseTo(GLYPH_SIZE / 2, 2);
    expect(y).toBeLessThan(GLYPH_SIZE / 2);
  });

  it('keeps every point inside the viewBox', () => {
    for (const shape of ['star5', 'star7']) {
      for (const value of numbers(SHAPES[shape].attributes.points)) {
        expect(value, `${shape} point ${value}`).toBeGreaterThanOrEqual(0);
        expect(value, `${shape} point ${value}`).toBeLessThanOrEqual(GLYPH_SIZE);
      }
    }
  });
});
