import { useCallback, useEffect, useState } from 'react';
import { fetchWithTimeout } from '../lib/fetchWithTimeout.js';

/** Maximum GeoJSON file size accepted by the hook (5 MB). */
const MAX_GEOJSON_BYTES = 5 * 1024 * 1024;

const initialState = { status: 'loading', data: null, error: null };

/**
 * Fetches and parses a GeoJSON file.  Loads once and caches in component
 * state.  Aborts cleanly on unmount via AbortController.  Exposes `reload`
 * so a failed load is recoverable without a full refresh (#365).
 *
 * Error messages are classified by failure type (timeout, size limit,
 * parse/validation, download) to match the pattern used by useSchoolData
 * (#459).
 *
 * @param {string} url  URL to the GeoJSON file (typically a static asset)
 * @returns {{ status: 'loading'|'ready'|'error', data: object|null, error: Error|null, reload: () => void }}
 */
export function useGeoJson(url) {
  const [state, setState] = useState(initialState);
  const [attempt, setAttempt] = useState(0);

  const reload = useCallback(() => {
    setState(initialState);
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      let downloadComplete = false;
      try {
        const text = await fetchWithTimeout(url, {
          signal: controller.signal,
          maxBytes: MAX_GEOJSON_BYTES,
        });
        downloadComplete = true;

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

        let message;
        if (err.name === 'TimeoutError') {
          message = 'GeoJSON \u8f09\u5165\u903e\u6642\uff0c\u8acb\u6aa2\u67e5\u7db2\u8def\u9023\u7dda';
        } else if (err.name === 'SizeLimitError') {
          message = `GeoJSON \u5927\u5c0f\u8d85\u904e\u4e0a\u9650 (${err.message})`;
        } else if (downloadComplete) {
          message = `GeoJSON \u89e3\u6790\u5931\u6557 (${err.message})`;
        } else {
          message = `GeoJSON \u8f09\u5165\u5931\u6557 (${err.message})`;
        }

        setState({
          status: 'error',
          data: null,
          error: new Error(message, { cause: err }),
        });
      }
    })();

    return () => controller.abort();
  }, [url, attempt]);

  return { ...state, reload };
}
