/**
 * Shared retry core — environment-agnostic retry loop and HTTP response
 * classification used by both browser-side fetchWithTimeout and
 * build-time fetchWithRetry.
 *
 * This module is intentionally free of DOM and Node-specific APIs
 * so both runtimes can safely import it.
 */

import { fullJitter, parseRetryAfter } from './backoff.js';

export const DEFAULT_RETRIES = 2;

/* ------------------------------------------------------------------ */
/*  HTTP response classification                                        */
/* ------------------------------------------------------------------ */

/**
 * Classify an HTTP Response into success, retriable error, or
 * non-retriable error.
 *
 * @param {Response} res  Fetch API Response (or compatible object with
 *                        ok, status, statusText, and headers)
 * @returns {Response}    The same response when `res.ok` is true
 * @throws {Error}        With `.retryAfterMs` for 429,
 *                        `.retriable = false` for other 4xx,
 *                        plain Error for 5xx / other
 */
export function classifyResponse(res) {
  if (res.ok) return res;

  // 429 Too Many Requests — retriable with optional Retry-After delay.
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

  // 5xx and anything else — retriable by default.
  throw new Error(`HTTP ${res.status} ${res.statusText}`);
}

/* ------------------------------------------------------------------ */
/*  Generic retry loop                                                  */
/* ------------------------------------------------------------------ */

/** Simple sleep for environments without AbortSignal needs. */
const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Execute `fn` with automatic retry, full-jitter exponential backoff,
 * and strategy-pattern injection for environment differences.
 *
 * The function `fn` receives the zero-based attempt index.  To signal
 * a non-retriable failure, throw an error with `{ retriable: false }`.
 * To request a minimum back-off, attach `{ retryAfterMs: <number> }`.
 *
 * @param {(attempt: number) => Promise<T>} fn
 * @param {{
 *   retries?: number,
 *   sleepFn?: (ms: number) => Promise<void>,
 *   onRetry?: (attempt: number, err: Error, delay: number) => void,
 * }} [options]
 * @returns {Promise<T>}
 * @template T
 */
export async function withRetry(
  fn,
  { retries = DEFAULT_RETRIES, sleepFn = defaultSleep, onRetry } = {},
) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      // Non-retriable errors (e.g. 4xx client errors) skip retry.
      if (err.retriable === false) throw err;

      // Last attempt — propagate the error.
      if (attempt === retries) throw err;

      // Back off before the next attempt (full-jitter exponential backoff).
      // If the error carries retryAfterMs (e.g. from 429), use at least that.
      const delay = Math.max(fullJitter(attempt), err.retryAfterMs ?? 0);
      onRetry?.(attempt, err, delay);
      await sleepFn(delay);
    }
  }
}
