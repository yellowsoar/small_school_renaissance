import { useEffect, useState } from 'react';
import { fetchWithTimeout } from '../lib/fetchWithTimeout.js';

/** Maximum GeoJSON file size accepted by the hook (5 MB). */
const MAX_GEOJSON_BYTES = 5 * 1024 * 1024;

const initialState = { status: 'loading', data: null, error: null };

/**
 * Fetches and parses a GeoJSON file.  Loads once and caches in component
 * state.  Aborts cleanly on unmount via AbortController.
 *
 * @param {string} url  URL to the GeoJSON file (typically a static asset)
 * @returns {{ status: 'loading'|'ready'|'error', data: object|null, error: Error|null }}
 */
export function useGeoJson(url) {
  const [state, setState] = useState(initialState);

  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      try {
        const text = await fetchWithTimeout(url, {
          signal: controller.signal,
          maxBytes: MAX_GEOJSON_BYTES,
        });

        const parsed = JSON.parse(text);
        if (parsed.type !== 'FeatureCollection' || !Array.isArray(parsed.features)) {
          throw new Error(
            `\u7121\u6548\u7684 GeoJSON\uff1a\u9810\u671f type="FeatureCollection"\uff0c\u5be6\u969b type="${parsed.type}"`
          );
        }
        if (controller.signal.aborted) return;

        setState({ status: 'ready', data: parsed, error: null });
      } catch (err) {
        if (err.name === 'AbortError') return;

        setState({
          status: 'error',
          data: null,
          error: new Error(`GeoJSON \u8f09\u5165\u5931\u6557 (${err.message})`, {
            cause: err,
          }),
        });
      }
    })();

    return () => controller.abort();
  }, [url]);

  return state;
}
