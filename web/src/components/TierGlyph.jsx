import { GLYPH_SIZE, shapeFor } from '../lib/shapes.js';

/**
 * The legend's copy of a marker glyph. Reads the same geometry the Leaflet
 * icons do, so the two can never disagree — and renders as real JSX rather
 * than injected HTML.
 */
export default function TierGlyph({ shape, color, size = GLYPH_SIZE }) {
  const { element: Element, attributes } = shapeFor(shape);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${GLYPH_SIZE} ${GLYPH_SIZE}`}
      aria-hidden="true"
      fill={color}
      stroke="rgba(255,255,255,.85)"
      strokeWidth="1"
      strokeLinejoin="round"
    >
      <Element {...attributes} />
    </svg>
  );
}
