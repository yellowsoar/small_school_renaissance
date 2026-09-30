import { useCallback, useEffect, useState } from 'react';
import { DATA_URL, MAX_CSV_BYTES } from '../config/index.js';
import { fetchWithTimeout } from '../lib/fetchWithTimeout.js';
import { DEFAULT_RETRIES } from '../lib/retry-core.js';
import { parseSchools } from '../lib/schools.js';

const initialState = { status: 'loading', schools: [], counties: [], error: null };

/**
 * Loads and parses the school dataset with timeout protection and automatic
 * retry, aborting cleanly on unmount.  Exposes `reload` so a failed load is
 * recoverable without a full refresh — the usual cause is a flaky network,
 * not a broken build.
 *
 * `retryInfo` exposes the current retry progress ({ current, total }) so the
 * UI can display which attempt is in flight.  It is `null` when no retry has
 * occurred yet or after a reload (#456).
 */
export function useSchoolData(url = DATA_URL) {
  const [state, setState] = useState(initialState);
  const [retryInfo, setRetryInfo] = useState(null);
  const [attempt, setAttempt] = useState(0);

  const reload = useCallback(() => {
    setState(initialState);
    setRetryInfo(null);
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    setRetryInfo(null);
    const controller = new AbortController();

    (async () => {
      let downloadComplete = false;
      try {
        // fetchWithTimeout now returns the response body as text, with
        // both header and body transfer covered by the same timeout (#173).
        // maxBytes enforces a size ceiling to prevent memory exhaustion (#207).
        // onRetry surfaces retry progress to the UI (#456).
        const text = await fetchWithTimeout(url, {
          signal: controller.signal,
          maxBytes: MAX_CSV_BYTES,
          onRetry: (retryAttempt) => {
            setRetryInfo({ current: retryAttempt + 2, total: DEFAULT_RETRIES + 1 });
          },
        });
        downloadComplete = true;

        const { schools, counties } = parseSchools(text);
        if (controller.signal.aborted) return;

        setState({ status: 'ready', schools, counties, error: null });
      } catch (error) {
        if (error.name === 'AbortError') return;

        let message;
        if (error.name === 'TimeoutError') {
          message = '資料載入逾時，請檢查網路連線後重新載入';
        } else if (error.name === 'SizeLimitError') {
          message = `資料大小超過上限 (${error.message})`;
        } else if (downloadComplete) {
          message = `資料解析失敗 (${error.message})`;
        } else {
          message = `資料下載失敗 (${error.message})`;
        }

        setState({
          ...initialState,
          status: 'error',
          error: new Error(message, { cause: error }),
        });
      }
    })();

    return () => controller.abort();
  }, [url, attempt]);

  return { ...state, retryInfo, reload };
}
