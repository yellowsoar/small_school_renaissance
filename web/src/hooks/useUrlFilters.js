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
    if (next !== currentUrl()) {
      // replaceState can throw SecurityError when the serialized URL exceeds
      // the browser's length limit. Keep the in-memory filter state intact
      // so the map remains functional even if the URL cannot be updated (#210).
      try {
        window.history.replaceState(null, '', next);
      } catch (err) {
        // URL too long or SecurityError — filter state is still usable in memory.
        console.warn('[useUrlFilters] replaceState failed:', err.message);
      }
    }
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

  /**
   * Clears the filters but keeps the year and the view state the user chose.
   * Zoom and the "推估歸零" toggle are view preferences, not filters: neither
   * counts toward ControlPanel's hasFilters, and App.jsx keeps both out of
   * dataFilters (#348, #364). Resetting them would yank the map back to the
   * island-wide view and flip the closed-school toggle behind the user (#472).
   */
  const reset = useCallback(
    () =>
      setFilters((current) => ({
        ...defaultFilters(),
        year: current.year,
        zoom: current.zoom,
        excludeClosed: current.excludeClosed,
      })),
    [],
  );

  return [filters, update, reset];
}
