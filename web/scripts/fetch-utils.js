/**
 * Fetch utilities for build-time scripts.
 *
 * Relies on AbortSignal.timeout() — requires Node.js >= 20.
 */

import { REQUIRED_HEADERS } from '../src/lib/csv-schema.js';
import { fullJitter, parseRetryAfter } from '../src/lib/backoff.js';

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RETRIES = 2;

/** Simple sleep for Node.js (no AbortSignal needed). */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ------------------------------------------------------------------ */
/*  Fetch with retry                                                    */
/* ------------------------------------------------------------------ */

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
      // Non-retriable errors (e.g. 4xx client errors) skip retry.
      if (err.retriable === false) throw err;

      if (attempt === retries) throw err;
      const label = err.name === 'TimeoutError' ? 'timeout' : err.message;
      const delay = Math.max(fullJitter(attempt), err.retryAfterMs ?? 0);
      console.warn(
        `\u26a0\ufe0f  attempt ${attempt + 1}/${retries + 1} failed (${label}), retrying in ${Math.round(delay)}ms\u2026`,
      );
      await sleep(delay);
    }
  }
}

/**
 * Validate that a downloaded string looks like the expected CSV dataset.
 *
 * Checks:
 * 1. Content is non-empty.
 * 2. Content does not look like HTML (error pages, login pages).
 * 3. The header line contains all `requiredHeaders` (column-level match).
 * 4. At least one data row exists beyond the header.
 *
 * @param {string} body - The raw response body text
 * @param {string[]} requiredHeaders - Column names that must appear in the
 *   first line. Defaults to the columns parseSchools() depends on.
 * @throws {Error} When validation fails, with a human-readable message
 *   including the actual first line (truncated to 120 chars) for diagnosis.
 */
export function validateCsvContent(
  body,
  requiredHeaders = REQUIRED_HEADERS,
) {
  if (!body || body.trim().length === 0) {
    throw new Error('downloaded content is empty');
  }

  const firstLine = body.split('\n')[0]?.trim() ?? '';

  // HTML error pages / login pages typically start with < or <!DOCTYPE
  if (/^\s*</.test(firstLine)) {
    throw new Error(
      `downloaded content appears to be HTML, not CSV` +
        ` (first line: ${firstLine.slice(0, 120)}${firstLine.length > 120 ? '\u2026' : ''})`,
    );
  }

  // Column-level match: split by comma, trim, strip enclosing quotes.
  // Aligned with parseSchools() which uses Array.includes() on parsed keys.
  const headers = firstLine.split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  const missing = requiredHeaders.filter((col) => !headers.includes(col));
  if (missing.length > 0) {
    throw new Error(
      `CSV header missing required columns: ${missing.join(', ')}` +
        `\n  actual header: ${firstLine.slice(0, 120)}${firstLine.length > 120 ? '\u2026' : ''}`,
    );
  }

  // At least one data row beyond the header
  const lines = body.trim().split('\n');
  if (lines.length < 2) {
    throw new Error('CSV contains a header but no data rows');
  }
}
