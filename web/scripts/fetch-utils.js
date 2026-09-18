/**
 * Fetch utilities for build-time scripts.
 *
 * Relies on AbortSignal.timeout() — requires Node.js >= 20.
 */

import { REQUIRED_HEADERS } from '../src/lib/csv-schema.js';
import { classifyResponse, withRetry, DEFAULT_RETRIES } from '../src/lib/retry-core.js';

const DEFAULT_TIMEOUT_MS = 30_000;

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
  return withRetry(
    async () => {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeout) });
      return classifyResponse(res);
    },
    {
      retries,
      onRetry: (attempt, err, delay) => {
        const label = err.name === 'TimeoutError' ? 'timeout' : err.message;
        console.warn(
          `\u26a0\ufe0f  attempt ${attempt + 1}/${retries + 1} failed (${label}), retrying in ${Math.round(delay)}ms\u2026`,
        );
      },
    },
  );
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
