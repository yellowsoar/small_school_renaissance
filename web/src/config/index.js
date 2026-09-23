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

/** Base (observed) school year in the dataset, in 民國 years. */
export const BASE_YEAR = 113;

/** Reference year the dataset compares against for the trend delta. */
export const REFERENCE_YEAR = 107;

/** Projection columns run 推估114年人數 … 推估130年人數. */
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
    label: '淺色底圖',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
  {
    id: 'dark',
    label: '深色底圖',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
];

/**
 * Loose bounding box covering Taiwan proper and all outlying islands
 * (Kinmen ≈ 118.3°E, Matsu ≈ 120.0°E, Orchid Island ≈ 121.6°E).
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
    label: '推估歸零',
    shape: 'star7',
    color: '#111111',
    max: 0,
    describe: () => '人數 = 0',
  },
  {
    id: 'critical',
    label: '極高風險',
    shape: 'star5',
    color: '#d7263d',
    max: 30,
    describe: () => '0 < 人數 ≤ 30',
  },
  {
    id: 'high',
    label: '高風險',
    shape: 'triangle',
    color: '#f07300',
    max: 50,
    describe: () => '30 < 人數 ≤ 50',
  },
  {
    id: 'watch',
    label: '需關注',
    shape: 'square',
    color: '#e5b700',
    max: 100,
    describe: () => '50 < 人數 ≤ 100',
  },
  {
    id: 'stable',
    label: '相對穩定',
    shape: 'circle',
    color: '#2f9e44',
    max: Infinity,
    describe: () => '人數 > 100',
  },
];

/**
 * Neutral marker definition for schools with no projection data.
 * Separated from RISK_TIERS because "no data" is not a risk level.
 */
export const UNPROJECTED_MARKER = {
  id: 'unprojected',
  label: '無推估資料',
  shape: 'circle',
  color: '#999',
  describe: () => '缺少推估資料',
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
      `RISK_TIERS 設定錯誤：找不到 id="${id}" 的分級。` +
        `可用的 id：${RISK_TIERS.map((t) => t.id).join('、')}`,
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
  `推估值取自上游資料集，以 ${BASE_YEAR} 與 ${REFERENCE_YEAR} 學年度的學生人數變化趨勢外推，未計入遷徙、新生兒數與學區調整。僅供風險排序參考，非廢校預測。`;
