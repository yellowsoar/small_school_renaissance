/** Dataset lives in public/data/, so it is resolved against the Vite base path. */
export const DATA_URL = `${import.meta.env.BASE_URL}data/113-107.csv`;

/** Base (observed) school year in the dataset, in 民國 years. */
export const BASE_YEAR = 113;

/** Reference year the dataset compares against for the trend delta. */
export const REFERENCE_YEAR = 107;

/** Projection columns run 推估114年人數 … 推估130年人數. */
export const PROJECTION_YEARS = Array.from({ length: 17 }, (_, i) => 114 + i);

export const MAP = {
  center: [23.75, 121],
  zoom: 7,
  minZoom: 6,
  maxZoom: 18,
  /** Below this zoom the individual school markers are hidden for legibility. */
  markerZoom: 11,
  tileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  tileAttribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
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

export const TIER_BY_ID = Object.fromEntries(RISK_TIERS.map((tier) => [tier.id, tier]));

/** Schools at or below this projected headcount feed the density heatmap. */
export const HEATMAP_THRESHOLD = 100;

export const HEATMAP_OPTIONS = {
  radius: 45,
  blur: 22,
  minOpacity: 0.35,
  maxZoom: 12,
  gradient: { 0.2: '#ffd166', 0.5: '#f07300', 0.85: '#d7263d' },
};
