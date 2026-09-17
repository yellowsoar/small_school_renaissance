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
