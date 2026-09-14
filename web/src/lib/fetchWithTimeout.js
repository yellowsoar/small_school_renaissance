/**
 * Browser-side fetch wrapper with timeout and automatic retry.
 *
 * Mirrors the build-time scripts/fetch-utils.js pattern but uses setTimeout
 * for broad browser compatibility instead of AbortSignal.timeout().
 */

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_RETRIES = 2;

/**
 * Fetch a URL with timeout and automatic retry, optionally linked to an
 * external AbortSignal (e.g. from a React useEffect cleanup).
 *
 * @param {string} url
 * @param {{ retries?: number, timeout?: number, signal?: AbortSignal }} [options]
 * @returns {Promise<Response>} A successful (ok) response
 * @throws On exhausted retries, timeout, or external abort
 */
export async function fetchWithTimeout(
  url,
  { retries = DEFAULT_RETRIES, timeout = DEFAULT_TIMEOUT_MS, signal } = {},
) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    // Bail immediately if the caller already aborted (e.g. React unmount).
    if (signal?.aborted) {
      throw new DOMException('The operation was aborted.', 'AbortError');
    }

    const controller = new AbortController();

    // Link external signal so a React unmount cancels the in-flight request.
    const onExternalAbort = () => controller.abort();
    signal?.addEventListener('abort', onExternalAbort, { once: true });

    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeout);

    try {
      const res = await fetch(url, { signal: controller.signal });
      if (res.ok) return res;
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    } catch (err) {
      // External abort (React unmount) takes priority — propagate immediately.
      if (signal?.aborted) {
        throw new DOMException('The operation was aborted.', 'AbortError');
      }

      // Normalise a timeout-caused AbortError into a TimeoutError so callers
      // can distinguish it from an external abort.
      const normalised =
        timedOut && err.name === 'AbortError'
          ? Object.assign(new Error(`Request timed out after ${timeout}ms`), {
              name: 'TimeoutError',
            })
          : err;

      if (attempt === retries) throw normalised;
      // else: retry silently
    } finally {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', onExternalAbort);
    }
  }
}
