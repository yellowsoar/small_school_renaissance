/**
 * Filters <-> query string. Pure and dependency-free so it can be tested
 * without a browser, and so the URL format is defined in exactly one place.
 *
 * A map of public data is something people cite: "look at 南投縣 in 130". That
 * only works if the view is addressable, so the filter state lives in the URL.
 */
import { PROJECTION_YEARS, RISK_TIERS } from '../config/index.js';

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

  return {
    year: Number.isInteger(year) && year >= MIN_YEAR && year <= MAX_YEAR ? year : DEFAULT_YEAR,
    counties: new Set(counties),
    tiers: new Set(splitList(params.get('tier')).filter((tier) => VALID_TIERS.has(tier))),
    search: params.get('q')?.trim() ?? '',
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
 * Serializes filters back to a query string, omitting anything left at its
 * default so a pristine view has a clean URL.
 */
export const searchFromFilters = (filters) => {
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
  if (filters.search.trim()) params.set('q', filters.search.trim());

  const query = params.toString();
  return query ? `?${query}` : '';
};
