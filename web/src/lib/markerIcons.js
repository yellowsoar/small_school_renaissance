import L from 'leaflet';

const SIZE = 18;
const HALF = SIZE / 2;

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

const SHAPES = {
  star7: () => `<polygon points="${star(7, 8.5, 4.2)}" />`,
  star5: () => `<polygon points="${star(5, 8.5, 3.6)}" />`,
  triangle: () => '<polygon points="9,1.5 16.5,15.5 1.5,15.5" />',
  square: () => '<rect x="3" y="3" width="12" height="12" rx="1.5" />',
  circle: () => '<circle cx="9" cy="9" r="6" />',
};

/** Renders a tier glyph as standalone SVG markup — reused by map and legend. */
export const shapeSvg = (shape, color, size = SIZE) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 ${SIZE} ${SIZE}" aria-hidden="true" ` +
  `fill="${color}" stroke="rgba(255,255,255,.85)" stroke-width="1" ` +
  `stroke-linejoin="round">${(SHAPES[shape] ?? SHAPES.circle)()}</svg>`;

const cache = new Map();

/** Cached Leaflet divIcon per tier — avoids rebuilding icons for 2.6k markers. */
export const iconFor = (tier) => {
  if (!cache.has(tier.id)) {
    cache.set(
      tier.id,
      L.divIcon({
        className: 'school-marker',
        html: shapeSvg(tier.shape, tier.color),
        iconSize: [SIZE, SIZE],
        iconAnchor: [HALF, HALF],
        popupAnchor: [0, -HALF],
      }),
    );
  }
  return cache.get(tier.id);
};
