/**
 * Browser-side fetch wrapper with timeout and automatic retry.
 *
 * Mirrors the build-time scripts/fetch-utils.js pattern but uses setTimeout
 * for broad browser compatibility instead of AbortSignal.timeout().
 */

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_RETRIES = 2;

/* ------------------------------------------------------------------ */
/*  Backoff helpers                                                     */
/* ------------------------------------------------------------------ */

const BACKOFF_BASE_MS = 1_000;
const BACKOFF_CAP_MS = 10_000;

/**
 * Full-jitter exponential backoff (AWS Architecture Blog recommended).
 *
 * Returns a uniformly distributed random delay in
 * `[0, min(cap, base * 2^attempt)]`.
 *
 * @param {number} attempt  Zero-based retry index
 * @param {number} [base]   Base delay in ms (default 1 000)
 * @param {number} [cap]    Maximum ceiling in ms (default 10 000)
 * @returns {number} Delay in ms
 */
function fullJitter(attempt, base = BACKOFF_BASE_MS, cap = BACKOFF_CAP_MS) {
  const ceiling = Math.min(cap, base * 2 ** attempt);
  return Math.random() * ceiling;
}

/**
 * Sleep that respects an external AbortSignal.
 *
 * Resolves after `ms` milliseconds, or rejects with AbortError if `signal`
 * fires first.  Both paths clean up the other listener to avoid memory leaks
 * (see openai-node #2151, anthropic-sdk-typescript #895).
 *
 * @param {number} ms        Duration in milliseconds
 * @param {AbortSignal} [signal]  Optional external signal (e.g. React unmount)
 * @returns {Promise<void>}
 */
function abortableSleep(ms, signal) {
  return new Promise((resolve, reject) => {
    // Already aborted — fail fast without scheduling a timer.
    if (signal?.aborted) {
      reject(new DOMException('The operation was aborted.', 'AbortError'));
      return;
    }

    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    function onAbort() {
      clearTimeout(timer);
      reject(new DOMException('The operation was aborted.', 'AbortError'));
    }

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/* ------------------------------------------------------------------ */
/*  Main fetch wrapper                                                  */
/* ------------------------------------------------------------------ */

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

      // Back off before the next attempt (full-jitter exponential backoff).
      await abortableSleep(fullJitter(attempt), signal);
    } finally {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', onExternalAbort);
    }
  }
}
