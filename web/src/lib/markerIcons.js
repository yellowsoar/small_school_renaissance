import L from 'leaflet';
import { GLYPH_SIZE, shapeFor } from './shapes.js';

const HALF = GLYPH_SIZE / 2;

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
        iconSize: [GLYPH_SIZE, GLYPH_SIZE],
        iconAnchor: [HALF, HALF],
        popupAnchor: [0, -HALF],
      }),
    );
  }
  return cache.get(tier.id);
};
