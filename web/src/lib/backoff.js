/**
 * Full-jitter exponential backoff — shared between browser-side
 * fetchWithTimeout and build-time fetch-utils.
 *
 * This module is intentionally environment-agnostic (no DOM or Node APIs)
 * so both runtimes can safely import it.
 *
 * @see https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/
 */

export const BACKOFF_BASE_MS = 1_000;
export const BACKOFF_CAP_MS = 10_000;

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
export function fullJitter(attempt, base = BACKOFF_BASE_MS, cap = BACKOFF_CAP_MS) {
  const ceiling = Math.min(cap, base * 2 ** attempt);
  return Math.random() * ceiling;
}

/**
 * Parse a Retry-After HTTP header value into milliseconds.
 *
 * Supports two formats defined by RFC 9110 §10.2.3:
 * - Delay-seconds: a non-negative integer (e.g. "120" → 120 000 ms)
 * - HTTP-date: an IMF-fixdate string (e.g. "Fri, 18 Sep 2026 01:45:00 GMT")
 *
 * Returns 0 when the header is absent, unparseable, or in the past.
 *
 * @param {string|null|undefined} header  Raw Retry-After header value
 * @returns {number} Delay in milliseconds (≥ 0)
 */
export function parseRetryAfter(header) {
  if (header == null || header.trim() === '') return 0;

  // Try integer seconds first (most common for 429 responses).
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds) * 1000;
  }

  // Try HTTP-date format.
  const date = new Date(header);
  if (!Number.isNaN(date.getTime())) {
    const delay = date.getTime() - Date.now();
    return delay > 0 ? delay : 0;
  }

  return 0;
}
