/**
 * Browser-side fetch wrapper with timeout and automatic retry.
 *
 * Uses the shared retry core (retry-core.js) for the retry loop and HTTP
 * response classification.  This module adds browser-specific concerns:
 * setTimeout-based request timeout, external AbortSignal linking
 * (e.g. React unmount), and abort-aware backoff sleep.
 */

import { classifyResponse, withRetry, DEFAULT_RETRIES } from './retry-core.js';

const DEFAULT_TIMEOUT_MS = 15_000;

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
 * The response body is consumed inside the same timeout scope so that a
 * stalled body transfer triggers the timeout or external abort (#173).
 *
 * @param {string} url
 * @param {{ retries?: number, timeout?: number, signal?: AbortSignal }} [options]
 * @returns {Promise<string>} The response body as text
 * @throws On exhausted retries, timeout, or external abort
 */
export async function fetchWithTimeout(
  url,
  { retries = DEFAULT_RETRIES, timeout = DEFAULT_TIMEOUT_MS, signal } = {},
) {
  return withRetry(
    async () => {
      // Bail immediately if the caller already aborted (e.g. React unmount).
      if (signal?.aborted) {
        throw Object.assign(
          new DOMException('The operation was aborted.', 'AbortError'),
          { retriable: false },
        );
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
        const checkedRes = classifyResponse(res);
        // Consume body inside the same timeout/signal scope so stalled
        // body transfers trigger the timeout or external abort (#173).
        const text = await checkedRes.text();
        return text;
      } catch (err) {
        // External abort (React unmount) takes priority — propagate immediately.
        if (signal?.aborted) {
          throw Object.assign(
            new DOMException('The operation was aborted.', 'AbortError'),
            { retriable: false },
          );
        }

        // Normalise a timeout-caused AbortError into a TimeoutError so callers
        // can distinguish it from an external abort.
        if (timedOut && err.name === 'AbortError') {
          throw Object.assign(
            new Error(`Request timed out after ${timeout}ms`),
            { name: 'TimeoutError' },
          );
        }

        throw err;
      } finally {
        clearTimeout(timeoutId);
        signal?.removeEventListener('abort', onExternalAbort);
      }
    },
    {
      retries,
      sleepFn: (ms) => abortableSleep(ms, signal),
    },
  );
}
