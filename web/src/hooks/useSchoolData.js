import { useCallback, useEffect, useState } from 'react';
import { DATA_URL } from '../config/index.js';
import { parseSchools } from '../lib/schools.js';

const initialState = { status: 'loading', schools: [], counties: [], error: null };

/**
 * Loads and parses the school dataset, aborting cleanly on unmount.
 * Exposes `reload` so a failed load is recoverable without a full refresh —
 * the usual cause is a flaky network, not a broken build.
 */
export function useSchoolData(url = DATA_URL) {
  const [state, setState] = useState(initialState);
  const [attempt, setAttempt] = useState(0);

  const reload = useCallback(() => {
    setState(initialState);
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`資料載入失敗 (HTTP ${response.status})`);
        }

        const { schools, counties } = parseSchools(await response.text());
        if (controller.signal.aborted) return;

        setState({ status: 'ready', schools, counties, error: null });
      } catch (error) {
        if (error.name === 'AbortError') return;
        setState({ ...initialState, status: 'error', error });
      }
    })();

    return () => controller.abort();
  }, [url, attempt]);

  return { ...state, reload };
}
