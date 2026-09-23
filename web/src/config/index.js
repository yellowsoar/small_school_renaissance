import { FIRST_PROJECTION_YEAR, LAST_PROJECTION_YEAR } from '../lib/csv-schema.js';

// Re-export MAX_CSV_BYTES from the single source of truth (csv-schema.js, #283).
// Existing browser-side imports continue to work unchanged.
export { MAX_CSV_BYTES } from '../lib/csv-schema.js';

/** Dataset lives in public/data/, so it is resolved against the Vite base path. */
export const DATA_URL = `${import.meta.env.BASE_URL}data/113-107.csv`;

/** Maximum allowed length for the URL search query parameter `q`.
 *  200 characters is generous for Chinese school/district searches
 *  while preventing expensive filterSchools iterations on crafted
 *  deep links and avoiding browser URL length limits (#210). */
export const MAX_QUERY_LENGTH = 200;

/** Base (observed) school year in the dataset, in \u6c11\u570b years. */
export const BASE_YEAR = 113;

/** Reference year the dataset compares against for the trend delta. */
export const REFERENCE_YEAR = 107;

/** Projection columns run \u63a8\u4f30114\u5e74\u4eba\u6578 \u2026 \u63a8\u4f30130\u5e74\u4eba\u6578. */
export const PROJECTION_YEARS = Array.from(
  { length: LAST_PROJECTION_YEAR - FIRST_PROJECTION_YEAR + 1 },
  (_, i) => FIRST_PROJECTION_YEAR + i,
);

export const MAP = {
  center: [23.75, 121],
  zoom: 7,
  minZoom: 6,
  maxZoom: 18,
  /** Below this zoom the individual school markers are hidden for legibility. */
  markerZoom: 11,
};

/**
 * Available base map tile layers. The first entry is the default.
 * Each entry provides a Leaflet-compatible URL template and attribution.
 */
export const TILE_LAYERS = [
  {
    id: 'osm',
    label: 'OpenStreetMap',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
  {
    id: 'positron',
    label: '\u6dfa\u8272\u5e95\u5716',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
  {
    id: 'dark',
    label: '\u6df1\u8272\u5e95\u5716',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
];

/**
 * Loose bounding box covering Taiwan proper and all outlying islands
 * (Kinmen \u2248 118.3\u00b0E, Matsu \u2248 120.0\u00b0E, Orchid Island \u2248 121.6\u00b0E).
 * Coordinates outside this box are treated as data errors and filtered
 * out in toSchool().
 */
export const TW_BOUNDS = {
  latMin: 21.5,
  latMax: 26.5,
  lngMin: 118.0,
  lngMax: 122.5,
};

/**
 * Risk tiers, ordered from most to least severe. `max` is inclusive,
 * `Infinity` closes the final bucket.
 */
export const RISK_TIERS = [
  {
    id: 'closed',
    label: '\u63a8\u4f30\u6b78\u96f6',
    shape: 'star7',
    color: '#111111',
    max: 0,
    describe: () => '\u4eba\u6578 = 0',
  },
  {
    id: 'critical',
    label: '\u6975\u9ad8\u98a8\u96aa',
    shape: 'star5',
    color: '#d7263d',
    max: 30,
    describe: () => '0 < \u4eba\u6578 \u2264 30',
  },
  {
    id: 'high',
    label: '\u9ad8\u98a8\u96aa',
    shape: 'triangle',
    color: '#f07300',
    max: 50,
    describe: () => '30 < \u4eba\u6578 \u2264 50',
  },
  {
    id: 'watch',
    label: '\u9700\u95dc\u6ce8',
    shape: 'square',
    color: '#e5b700',
    max: 100,
    describe: () => '50 < \u4eba\u6578 \u2264 100',
  },
  {
    id: 'stable',
    label: '\u76f8\u5c0d\u7a69\u5b9a',
    shape: 'circle',
    color: '#2f9e44',
    max: Infinity,
    describe: () => '\u4eba\u6578 > 100',
  },
];

/**
 * Neutral marker definition for schools with no projection data.
 * Separated from RISK_TIERS because "no data" is not a risk level.
 */
export const UNPROJECTED_MARKER = {
  id: 'unprojected',
  label: '\u7121\u63a8\u4f30\u8cc7\u6599',
  shape: 'circle',
  color: '#999',
  describe: () => '\u7f3a\u5c11\u63a8\u4f30\u8cc7\u6599',
};

/**
 * Defensive lookup for a RISK_TIERS entry by id. Throws a descriptive
 * error when the requested id does not exist, so config typos surface
 * immediately at module load instead of producing an opaque TypeError
 * on `.max` access (#239).
 */
export const requireTier = (id) => {
  const tier = RISK_TIERS.find((t) => t.id === id);
  if (!tier) {
    throw new Error(
      `RISK_TIERS \u8a2d\u5b9a\u932f\u8aa4\uff1a\u627e\u4e0d\u5230 id="${id}" \u7684\u5206\u7d1a\u3002` +
        `\u53ef\u7528\u7684 id\uff1a${RISK_TIERS.map((t) => t.id).join('\u3001')}`,
    );
  }
  return tier;
};

/**
 * Schools at or below this projected headcount feed the density heatmap.
 * Derived from RISK_TIERS to stay in sync with the watch-tier ceiling (#106).
 */
export const HEATMAP_THRESHOLD = requireTier('watch').max;

export const HEATMAP_OPTIONS = {
  radius: 45,
  blur: 22,
  minOpacity: 0.35,
  /** Zoom at which a point reaches full intensity; past MAP.markerZoom the
   *  individual markers take over, so the heat stops gaining contrast. */
  maxZoom: MAP.markerZoom,
  gradient: { 0.2: '#ffd166', 0.5: '#f07300', 0.85: '#d7263d' },
};

/**
 * How the projections were produced upstream, stated in the UI so the numbers
 * are not read as a forecast of actual school closures.
 */
export const METHODOLOGY =
  `\u63a8\u4f30\u503c\u53d6\u81ea\u4e0a\u6e38\u8cc7\u6599\u96c6\uff0c\u4ee5 ${BASE_YEAR} \u8207 ${REFERENCE_YEAR} \u5b78\u5e74\u5ea6\u7684\u5b78\u751f\u4eba\u6578\u8b8a\u5316\u8da8\u52e2\u5916\u63a8\uff0c\u672a\u8a08\u5165\u9077\u5f99\u3001\u65b0\u751f\u5152\u6578\u8207\u5b78\u5340\u8abf\u6574\u3002\u50c5\u4f9b\u98a8\u96aa\u6392\u5e8f\u53c3\u8003\uff0c\u975e\u5ee2\u6821\u9810\u6e2c\u3002`;

/** URL for the county boundary GeoJSON (served as a static asset). */
export const COUNTY_BOUNDARY_URL = `${import.meta.env.BASE_URL}data/county-boundaries.geojson`;

/**
 * Available overlay layers. Each entry represents a toggleable GeoJSON layer.
 * `defaultEnabled` controls whether the layer is visible on first load.
 */
export const OVERLAY_LAYERS = [
  { id: 'countyBoundary', label: '\u7e23\u5e02\u754c\u7dda', defaultEnabled: true },
];
