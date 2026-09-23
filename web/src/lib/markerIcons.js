import L from 'leaflet';
import { GLYPH_SIZE, shapeFor } from './shapes.js';

const HALF = GLYPH_SIZE / 2;

/**
 * Clickable hit-area side length. ~80% larger area than the visual
 * glyph (GLYPH_SIZE²) so small markers are easier to tap (#347).
 * Derived: ceil(18 × √1.8) = 24 → 24² / 18² ≈ 1.78 ≈ 80%.
 */
export const HIT_SIZE = 24;
const HIT_HALF = HIT_SIZE / 2;

const svgFor = (shape, color) => {
  const { element, attributes } = shapeFor(shape);
  const attrs = Object.entries(attributes)
    .map(([name, value]) => `${name}="${value}"`)
    .join(' ');

  return (
    `<svg width="${GLYPH_SIZE}" height="${GLYPH_SIZE}" ` +
    `viewBox="0 0 ${GLYPH_SIZE} ${GLYPH_SIZE}" aria-hidden="true" fill="${color}" ` +
    `stroke="rgba(255,255,255,.85)" stroke-width="1" stroke-linejoin="round">` +
    `<${element} ${attrs} /></svg>`
  );
};

const cache = new Map();

/** Cached Leaflet divIcon per tier — avoids rebuilding icons for 2.6k markers. */
export const iconFor = (tier) => {
  if (!cache.has(tier.id)) {
    cache.set(
      tier.id,
      L.divIcon({
        className: 'school-marker',
        html: svgFor(tier.shape, tier.color),
        iconSize: [HIT_SIZE, HIT_SIZE],
        iconAnchor: [HIT_HALF, HIT_HALF],
        popupAnchor: [0, -HALF],
      }),
    );
  }
  return cache.get(tier.id);
};
