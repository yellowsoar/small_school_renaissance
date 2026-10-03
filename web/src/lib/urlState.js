/**
 * Filters + view state <-> query string. Pure and dependency-free so it can be
 * tested without a browser, and so the URL format is defined in exactly one
 * place.
 *
 * A map of public data is something people cite: "look at 南投縣 in 130". That
 * only works if the view is addressable, so this state lives in the URL.
 *
 * The URL carries two groups of state (#478):
 * - filters (year, counties, tiers, search) decide which schools are counted.
 *   "清除篩選" resets these.
 * - view (zoom, excludeClosed) is how the user is looking at the result. It is
 *   never touched by a filter reset, and changing it must not re-run
 *   filterSchools.
 * Keeping them in separate objects means a reset or a new filter field cannot
 * accidentally clobber view state (#472).
 */
import { MAP, MAX_QUERY_LENGTH, PROJECTION_YEARS, RISK_TIERS } from '../config/index.js';

const VALID_TIERS = new Set(RISK_TIERS.map((tier) => tier.id));
const MIN_YEAR = PROJECTION_YEARS.at(0);
const MAX_YEAR = PROJECTION_YEARS.at(-1);

export const DEFAULT_YEAR = MAX_YEAR;

/** A pristine filter set. Fresh Sets each call, since callers mutate copies. */
export const defaultFilters = () => ({
  year: DEFAULT_YEAR,
  counties: new Set(),
  tiers: new Set(),
  search: '',
});

/** The default view: island-wide zoom, zero-out schools hidden. */
export const defaultView = () => ({
  zoom: MAP.zoom,
  excludeClosed: true,
});

/** Multi-value params are comma separated; empty means "no filter". */
const splitList = (value) =>
  (value ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

/**
 * Reads filters out of a query string. Unknown or malformed values fall back
 * to the default rather than throwing — a hand-edited or stale URL should
 * still render a map.
 *
 * County names are not validated here: the URL is read before the dataset has
 * loaded, so there is nothing to validate against yet. Run pruneCounties once
 * the data arrives.
 */
export const filtersFromSearch = (search) => {
  const params = new URLSearchParams(search);

  const year = Number.parseInt(params.get('year'), 10);
  const counties = splitList(params.get('county'));

  // Truncate `q` to prevent expensive filterSchools iterations on crafted
  // deep links and avoid exceeding browser URL length limits (#210).
  const rawQ = params.get('q')?.trim() ?? '';

  return {
    year: Number.isInteger(year) && year >= MIN_YEAR && year <= MAX_YEAR ? year : DEFAULT_YEAR,
    counties: new Set(counties),
    tiers: new Set(splitList(params.get('tier')).filter((tier) => VALID_TIERS.has(tier))),
    search: rawQ.slice(0, MAX_QUERY_LENGTH),
  };
};

/**
 * Reads view state out of a query string. Same fallback rules as
 * filtersFromSearch: anything malformed becomes the default.
 */
export const viewFromSearch = (search) => {
  const params = new URLSearchParams(search);

  // Zoom level from `z` param, validated against MAP bounds (#348).
  const z = Number.parseInt(params.get('z'), 10);

  return {
    zoom: Number.isInteger(z) && z >= MAP.minZoom && z <= MAP.maxZoom ? z : MAP.zoom,
    excludeClosed: params.get('closed') !== '1',
  };
};

/**
 * Drops county names the dataset does not contain. A stale or mistyped link
 * would otherwise filter the map down to nothing with no visible cause.
 * Returns the same object when nothing changed, so it is safe in a setState.
 */
export const pruneCounties = (filters, knownCounties) => {
  if (!knownCounties) return filters;

  const kept = [...filters.counties].filter((county) => knownCounties.has(county));
  if (kept.length === filters.counties.size) return filters;

  return { ...filters, counties: new Set(kept) };
};

/**
 * Serializes filters and view back to a single query string, omitting
 * anything left at its default so a pristine view has a clean URL.
 *
 * Both groups go through this one function so the parameter order stays
 * fixed (year, county, tier, q, closed, z) and existing links keep producing
 * the same URL.
 */
export const searchFromFilters = (filters, view = defaultView()) => {
  const params = new URLSearchParams();

  if (filters.year !== DEFAULT_YEAR) params.set('year', String(filters.year));
  // Sorted so the same selection always produces the same URL.
  if (filters.counties.size > 0) params.set('county', [...filters.counties].sort().join(','));
  if (filters.tiers.size > 0) {
    const order = RISK_TIERS.map((tier) => tier.id);
    params.set(
      'tier',
      [...filters.tiers].sort((a, b) => order.indexOf(a) - order.indexOf(b)).join(','),
    );
  }
  // Defensive truncation: even if search state somehow exceeds the limit
  // (e.g. programmatic update), the serialized URL stays bounded (#210).
  const trimmed = filters.search.trim();
  if (trimmed) params.set('q', trimmed.slice(0, MAX_QUERY_LENGTH));
  if (!view.excludeClosed) params.set('closed', '1');
  if (view.zoom != null && view.zoom !== MAP.zoom) params.set('z', String(view.zoom));

  const query = params.toString();
  return query ? `?${query}` : '';
};
