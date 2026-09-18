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
/*  Size-limited body reader                                            */
/* ------------------------------------------------------------------ */

/**
 * Read the full response body as text, enforcing a byte-size ceiling.
 *
 * When `maxBytes` is provided:
 * 1. Reject early if the Content-Length header exceeds the limit.
 * 2. Stream the body via `response.body.getReader()`, accumulating
 *    chunks and aborting when the cumulative size exceeds `maxBytes`.
 * 3. Fall back to `response.text()` + post-check when ReadableStream
 *    body is unavailable (e.g. mocked responses in tests).
 *
 * When `maxBytes` is omitted or undefined, delegates to `response.text()`
 * with zero overhead (existing behavior).
 *
 * @param {Response} response  Fetch API Response (after classifyResponse)
 * @param {number} [maxBytes]  Optional byte-size ceiling
 * @returns {Promise<string>}  The response body as text
 * @throws {Error}             With `name: 'SizeLimitError'` and
 *                             `retriable: false` when the limit is exceeded
 */
async function readBodyWithLimit(response, maxBytes) {
  // No limit requested — fast path, zero overhead.
  if (maxBytes == null) {
    return response.text();
  }

  // Early rejection via Content-Length header when available.
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw Object.assign(
      new Error(
        `Response size ${contentLength} bytes exceeds limit of ${maxBytes} bytes`,
      ),
      { name: 'SizeLimitError', retriable: false },
    );
  }

  // Streaming read with cumulative size check.
  if (response.body) {
    const reader = response.body.getReader();
    const chunks = [];
    let received = 0;

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        received += value.byteLength;
        if (received > maxBytes) {
          reader.cancel();
          throw Object.assign(
            new Error(
              `Response size exceeds limit of ${maxBytes} bytes (received ${received}+ bytes)`,
            ),
            { name: 'SizeLimitError', retriable: false },
          );
        }
        chunks.push(value);
      }
    } catch (err) {
      if (err.name === 'SizeLimitError' || err.name === 'AbortError') throw err;
      throw err;
    }

    const decoder = new TextDecoder();
    return (
      chunks.map((c) => decoder.decode(c, { stream: true })).join('') +
      decoder.decode()
    );
  }

  // Fallback: response.body is null (e.g. mocked Response in tests).
  const text = await response.text();
  const byteLength = new TextEncoder().encode(text).byteLength;
  if (byteLength > maxBytes) {
    throw Object.assign(
      new Error(
        `Response size ${byteLength} bytes exceeds limit of ${maxBytes} bytes`,
      ),
      { name: 'SizeLimitError', retriable: false },
    );
  }
  return text;
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
 * @param {{ retries?: number, timeout?: number, signal?: AbortSignal, maxBytes?: number }} [options]
 * @returns {Promise<string>} The response body as text
 * @throws On exhausted retries, timeout, external abort, or size limit exceeded
 */
export async function fetchWithTimeout(
  url,
  { retries = DEFAULT_RETRIES, timeout = DEFAULT_TIMEOUT_MS, signal, maxBytes } = {},
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
        // When maxBytes is provided, enforce streaming size limit (#207).
        const text = await readBodyWithLimit(checkedRes, maxBytes);
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
      onRetry: (attempt, err, delay) => {
        const label = err.name === 'TimeoutError' ? 'timeout' : err.message;
        console.warn(
          `[fetchWithTimeout] attempt ${attempt + 1}/${retries + 1} failed (${label}), ` +
            `retrying in ${Math.round(delay)}ms\u2026`,
        );
      },
    },
  );
}
