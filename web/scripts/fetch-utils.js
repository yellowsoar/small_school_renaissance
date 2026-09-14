/**
 * Fetch utilities for build-time scripts.
 *
 * Relies on AbortSignal.timeout() — requires Node.js >= 20.
 */

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RETRIES = 2;

/**
 * Fetch a URL with timeout and automatic retry.
 *
 * @param {string} url - URL to fetch
 * @param {{ retries?: number, timeout?: number }} options
 * @returns {Promise<Response>} A successful response (res.ok === true)
 * @throws {Error|DOMException} After all retries are exhausted
 */
export async function fetchWithRetry(
  url,
  { retries = DEFAULT_RETRIES, timeout = DEFAULT_TIMEOUT_MS } = {},
) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeout) });
      if (res.ok) return res;
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    } catch (err) {
      if (attempt === retries) throw err;
      const label = err.name === 'TimeoutError' ? 'timeout' : err.message;
      console.warn(
        `\u26a0\ufe0f  attempt ${attempt + 1}/${retries + 1} failed (${label}), retrying\u2026`,
      );
    }
  }
}
