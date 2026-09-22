/**
 * Fetch utilities for build-time scripts.
 *
 * Relies on AbortSignal.timeout() — requires Node.js >= 20.
 */

import { createHash } from 'node:crypto';

import Papa from 'papaparse';

import { REQUIRED_HEADERS } from '../src/lib/csv-schema.js';
import { classifyResponse, withRetry, DEFAULT_RETRIES } from '../src/lib/retry-core.js';
import { readBodyWithLimit } from '../src/lib/body-reader.js';

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Maximum response body size (bytes) that fetchWithRetry will accept.
 * Aligned with the browser-side MAX_CSV_BYTES in fetchWithTimeout (#207).
 */
const MAX_BODY_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Minimum number of data rows (excluding header) required for the CSV to
 * pass build-time validation.  The full dataset contains ~2,600 schools;
 * 100 is a conservative floor (~4%) that catches truncated downloads
 * without false-positiving on legitimate future dataset shrinkage.
 */
const MIN_DATA_ROWS = 100;

/* ------------------------------------------------------------------ */
/*  Fetch with retry                                                    */
/* ------------------------------------------------------------------ */

/**
 * Fetch a URL with timeout and automatic retry.
 *
 * The entire request lifecycle — including response body consumption —
 * is covered by the retry loop.  If the body read fails (e.g. stream
 * error or timeout), the request is retried automatically (#211).
 *
 * When `maxBytes` is provided (defaults to 10 MB), the response body
 * size is enforced via streaming read with early abort (#259).
 *
 * @param {string} url - URL to fetch
 * @param {{ retries?: number, timeout?: number, maxBytes?: number }} options
 * @returns {Promise<{ body: string, contentType: string }>} The response
 *   body text and Content-Type header value (empty string when absent)
 * @throws {Error|DOMException} After all retries are exhausted
 */
export async function fetchWithRetry(
  url,
  { retries = DEFAULT_RETRIES, timeout = DEFAULT_TIMEOUT_MS, maxBytes = MAX_BODY_BYTES } = {},
) {
  return withRetry(
    async () => {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeout) });
      classifyResponse(res);
      const contentType = res.headers.get('content-type') ?? '';
      const body = await readBodyWithLimit(res, maxBytes);
      return { body, contentType };
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

/* ------------------------------------------------------------------ */
/*  CSV integrity verification (#222)                                   */
/* ------------------------------------------------------------------ */

/**
 * Compute a SHA-256 hash of the given content and optionally verify it
 * against an expected value.
 *
 * Pure function: all I/O (reading data-integrity.json, writing files)
 * is the caller's responsibility.
 *
 * @param {string} body - The raw CSV content to hash
 * @param {string} [expectedHash] - Expected SHA-256 hex digest. When
 *   non-empty the function throws if the computed hash does not match.
 *   Empty string or undefined skips the check (unconfigured state).
 * @returns {string} The computed SHA-256 hex digest
 * @throws {Error} When expectedHash is non-empty and does not match
 */
export function verifyCsvIntegrity(body, expectedHash) {
  const actual = createHash('sha256').update(body, 'utf-8').digest('hex');

  if (expectedHash && actual !== expectedHash) {
    throw new Error(
      `CSV integrity check failed: expected sha256 ${expectedHash}, got ${actual}`,
    );
  }

  return actual;
}

/**
 * Validate that a downloaded string looks like the expected CSV dataset.
 *
 * Checks:
 * 1. Content is non-empty.
 * 2. Content does not look like HTML (error pages, login pages).
 * 3. The header line contains all `requiredHeaders` (column-level match).
 * 4. At least one data row exists beyond the header (RFC 4180 record count).
 * 5. Data row count meets the minimum threshold (truncation guard).
 *
 * Record counting uses PapaParse to correctly handle RFC 4180 quoted fields
 * that contain embedded newlines, instead of splitting on physical newlines
 * which over-counts rows in multi-line fields (#209).
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

  // Use PapaParse for accurate RFC 4180 record counting.
  // Physical newline splitting over-counts when quoted fields contain
  // embedded newlines (#209).
  const { data } = Papa.parse(body, { header: true, skipEmptyLines: true });

  if (data.length < 1) {
    throw new Error('CSV contains a header but no data rows');
  }

  // Guard against truncated downloads: the full dataset has ~2,600 rows.
  if (data.length < MIN_DATA_ROWS) {
    throw new Error(
      `CSV has only ${data.length} data row(s), expected at least ${MIN_DATA_ROWS}` +
        ` \u2014 the download may be truncated`,
    );
  }
}
