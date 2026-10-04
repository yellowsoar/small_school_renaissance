import { useCallback, useEffect, useRef, useState } from 'react';
import {
  defaultFilters,
  filtersFromSearch,
  pruneCounties,
  searchFromFilters,
  viewFromSearch,
} from '../lib/urlState.js';

const currentUrl = () =>
  `${window.location.pathname}${window.location.search}${window.location.hash}`;

/**
 * Filter and view state, mirrored into the query string so a view can be
 * linked to.
 *
 * The two groups are held separately (#478): filters (year, counties, tiers,
 * search) decide which schools are counted, view (zoom, excludeClosed) is how
 * the result is shown. reset() only ever touches filters, and a zoom change
 * never produces a new filters object, so filterSchools does not re-run on
 * every scroll. Both groups still share one URL and one replaceState call, so
 * changing both in the same tick cannot drop either side's parameters.
 *
 * Uses replaceState rather than pushState: dragging the year slider would
 * otherwise bury the back button under a hundred history entries. The
 * trade-off is that back leaves the map instead of undoing a filter, which is
 * the right behaviour for a single-screen tool.
 *
 * @param knownCounties optional Set, supplied once the dataset has loaded, so
 *   county names absent from the data are dropped instead of silently
 *   filtering the map down to nothing.
 * @returns `[filters, update, reset, view, updateView]`
 */
export function useUrlFilters(knownCounties = null) {
  const [filters, setFilters] = useState(() => filtersFromSearch(window.location.search));
  const [view, setView] = useState(() => viewFromSearch(window.location.search));

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

  // The only place that writes the URL: both groups are serialized together.
  useEffect(() => {
    const next = `${window.location.pathname}${searchFromFilters(filters, view)}${window.location.hash}`;
    if (next !== currentUrl()) {
      // replaceState can throw SecurityError when the serialized URL exceeds
      // the browser's length limit. Keep the in-memory state intact so the
      // map remains functional even if the URL cannot be updated (#210).
      try {
        window.history.replaceState(null, '', next);
      } catch (err) {
        // URL too long or SecurityError — state is still usable in memory.
        console.warn('[useUrlFilters] replaceState failed:', err.message);
      }
    }
  }, [filters, view]);

  // Someone can still arrive here via back/forward from another page.
  // Restores both groups; React batches the two updates into one render.
  useEffect(() => {
    const sync = () => {
      setFilters(
        pruneCounties(filtersFromSearch(window.location.search), countiesRef.current),
      );
      setView(viewFromSearch(window.location.search));
    };
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);

  const update = useCallback(
    (patch) => setFilters((current) => ({ ...current, ...patch })),
    [],
  );

  const updateView = useCallback(
    (patch) => setView((current) => ({ ...current, ...patch })),
    [],
  );

  /**
   * Clears the filters but keeps the year. View state lives in its own
   * object, so zoom and the "推估歸零" toggle are left alone without having
   * to be listed here (#472, #478).
   */
  const reset = useCallback(
    () => setFilters((current) => ({ ...defaultFilters(), year: current.year })),
    [],
  );

  return [filters, update, reset, view, updateView];
}
