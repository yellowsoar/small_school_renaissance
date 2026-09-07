import { useCallback, useEffect, useRef, useState } from 'react';
import {
  defaultFilters,
  filtersFromSearch,
  pruneCounties,
  searchFromFilters,
} from '../lib/urlState.js';

const currentUrl = () =>
  `${window.location.pathname}${window.location.search}${window.location.hash}`;

/**
 * Filter state, mirrored into the query string so a view can be linked to.
 *
 * Uses replaceState rather than pushState: dragging the year slider would
 * otherwise bury the back button under a hundred history entries. The
 * trade-off is that back leaves the map instead of undoing a filter, which is
 * the right behaviour for a single-screen tool.
 *
 * @param knownCounties optional Set, supplied once the dataset has loaded, so
 *   county names absent from the data are dropped instead of silently
 *   filtering the map down to nothing.
 * @returns `[filters, update, reset]`
 */
export function useUrlFilters(knownCounties = null) {
  const [filters, setFilters] = useState(() => filtersFromSearch(window.location.search));

  // Read by the popstate listener, which is registered once and would
  // otherwise close over the counties as they were on first render. Assigned
  // in an effect rather than during render, which concurrent React treats as
  // a side effect.
  const countiesRef = useRef(knownCounties);
  useEffect(() => {
    countiesRef.current = knownCounties;
  }, [knownCounties]);

  // Re-validate once the counties are known. Runs on the Set identity, which
  // is stable for the lifetime of a loaded dataset.
  useEffect(() => {
    if (!knownCounties) return;
    setFilters((current) => pruneCounties(current, knownCounties));
  }, [knownCounties]);

  useEffect(() => {
    const next = `${window.location.pathname}${searchFromFilters(filters)}${window.location.hash}`;
    if (next !== currentUrl()) window.history.replaceState(null, '', next);
  }, [filters]);

  // Someone can still arrive here via back/forward from another page.
  useEffect(() => {
    const sync = () =>
      setFilters(
        pruneCounties(filtersFromSearch(window.location.search), countiesRef.current),
      );
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);

  const update = useCallback(
    (patch) => setFilters((current) => ({ ...current, ...patch })),
    [],
  );

  /** Clears the filters but keeps the year the user chose. */
  const reset = useCallback(
    () => setFilters((current) => ({ ...defaultFilters(), year: current.year })),
    [],
  );

  return [filters, update, reset];
}
