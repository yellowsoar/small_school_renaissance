/**
 * Browser-side fetch wrapper with timeout and automatic retry.
 *
 * Mirrors the build-time scripts/fetch-utils.js pattern but uses setTimeout
 * for broad browser compatibility instead of AbortSignal.timeout().
 */

import { fullJitter, parseRetryAfter } from './backoff.js';

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_RETRIES = 2;

/* ------------------------------------------------------------------ */
/*  Sleep helper                                                        */
/* ------------------------------------------------------------------ */

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

      // 429 Too Many Requests is a transient rate-limit — retriable
      // with optional Retry-After delay.
      if (res.status === 429) {
        throw Object.assign(
          new Error(`HTTP ${res.status} ${res.statusText}`),
          { retryAfterMs: parseRetryAfter(res.headers.get('Retry-After')) },
        );
      }

      // Other 4xx client errors are not retriable — fail immediately.
      if (res.status >= 400 && res.status < 500) {
        throw Object.assign(
          new Error(`HTTP ${res.status} ${res.statusText}`),
          { retriable: false },
        );
      }

      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    } catch (err) {
      // External abort (React unmount) takes priority — propagate immediately.
      if (signal?.aborted) {
        throw new DOMException('The operation was aborted.', 'AbortError');
      }

      // Non-retriable errors (e.g. 4xx client errors) skip retry.
      if (err.retriable === false) throw err;

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
      // If the server sent Retry-After, use at least that delay.
      await abortableSleep(
        Math.max(fullJitter(attempt), normalised.retryAfterMs ?? 0),
        signal,
      );
    } finally {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', onExternalAbort);
    }
  }
}
