/**
 * Tier glyph geometry, shared by the Leaflet markers (which need an HTML
 * string) and the legend (which renders JSX). Defining the shapes once is what
 * stops the two from drifting apart.
 */

export const GLYPH_SIZE = 18;

const HALF = GLYPH_SIZE / 2;

/** Evenly spaced star polygon points, drawn clockwise from 12 o'clock. */
const star = (points, outer, inner) =>
  Array.from({ length: points * 2 }, (_, i) => {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = (Math.PI * i) / points - Math.PI / 2;
    return `${(HALF + radius * Math.cos(angle)).toFixed(2)},${(
      HALF +
      radius * Math.sin(angle)
    ).toFixed(2)}`;
  }).join(' ');

/**
 * Each shape is described as an SVG element name plus its attributes, so both
 * renderers can consume it without string surgery.
 */
export const SHAPES = {
  star7: { element: 'polygon', attributes: { points: star(7, 8.5, 4.2) } },
  star5: { element: 'polygon', attributes: { points: star(5, 8.5, 3.6) } },
  triangle: { element: 'polygon', attributes: { points: '9,1.5 16.5,15.5 1.5,15.5' } },
  square: { element: 'rect', attributes: { x: 3, y: 3, width: 12, height: 12, rx: 1.5 } },
  circle: { element: 'circle', attributes: { cx: 9, cy: 9, r: 6 } },
};

/** Falls back to a circle so an unknown tier still renders something. */
export const shapeFor = (shape) => SHAPES[shape] ?? SHAPES.circle;
