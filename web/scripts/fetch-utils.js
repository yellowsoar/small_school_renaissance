/**
 * Fetch utilities for build-time scripts.
 *
 * Relies on AbortSignal.timeout() — requires Node.js >= 20.
 */

import { createHash } from 'node:crypto';

import Papa from 'papaparse';

import { REQUIRED_HEADERS, MAX_CSV_BYTES, CRITICAL_PARSE_ERROR_CODES, MAX_CRITICAL_ERROR_RATIO } from '../src/lib/csv-schema.js';
import { classifyResponse, withRetry, DEFAULT_RETRIES } from '../src/lib/retry-core.js';
import { readBodyWithLimit } from '../src/lib/body-reader.js';

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Minimum number of data rows (excluding header) required for the CSV to
 * pass build-time validation.  The full dataset contains ~2,600 schools;
 * 100 is a conservative floor (~4%) that catches truncated downloads
 * without false-positiving on legitimate future dataset shrinkage.
 */
const MIN_DATA_ROWS = 100;

/** Maximum number of sample schools shown in the TOFU data preview. */
const PREVIEW_SAMPLE_COUNT = 3;

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
  { retries = DEFAULT_RETRIES, timeout = DEFAULT_TIMEOUT_MS, maxBytes = MAX_CSV_BYTES } = {},
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
 * 6. Structural parse errors (field-alignment) do not exceed the shared
 *    threshold from csv-schema.js, aligned with parseSchools() (#311).
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
  const { data, errors } = Papa.parse(body, { header: true, skipEmptyLines: true });

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

  // --- Structural parse-error guard (#311) --------------------------------
  // Check for field-alignment errors (TooFewFields, TooManyFields,
  // InvalidQuotes) using the same threshold as parseSchools() (#208).
  // This prevents CI from deploying a CSV that the browser-side parser
  // would reject at runtime.
  if (errors.length > 0) {
    const critical = errors.filter((e) =>
      CRITICAL_PARSE_ERROR_CODES.includes(e.code),
    );
    if (critical.length > data.length * MAX_CRITICAL_ERROR_RATIO) {
      throw new Error(
        `CSV structural errors exceed threshold: ${critical.length}/${data.length} rows` +
          ` (${((critical.length / data.length) * 100).toFixed(1)}%) have field-alignment errors` +
          ` (${[...new Set(critical.map((e) => e.code))].join(', ')}),` +
          ` exceeding the ${MAX_CRITICAL_ERROR_RATIO * 100}% limit` +
          ` \u2014 the browser-side parser would reject this dataset`,
      );
    }
  }
}

/* ------------------------------------------------------------------ */
/*  TOFU data preview (#317)                                            */
/* ------------------------------------------------------------------ */

/**
 * Generate a structural summary of a CSV body for visual review during
 * TOFU auto-bootstrap.
 *
 * The summary gives developers enough information to spot obvious
 * anomalies (wrong dataset, corrupted content, unexpected row counts)
 * without opening the file manually.
 *
 * Non-blocking: returns `null` on any parse failure so the caller can
 * proceed with auto-bootstrap regardless.
 *
 * @param {string} body - The raw CSV content (already validated by
 *   `validateCsvContent` before this function is called)
 * @returns {{ totalRows: number, sampleSchools: Array<{ name: string, county: string }>, coordinateBounds: { latMin: number, latMax: number, lonMin: number, lonMax: number } | null } | null}
 */
export function summarizeCsvForReview(body) {
  try {
    const { data } = Papa.parse(body, { header: true, skipEmptyLines: true });

    if (!data || data.length === 0) {
      return null;
    }

    const totalRows = data.length;

    // Extract sample schools (first N with a non-empty name).
    const sampleSchools = [];
    for (const row of data) {
      if (sampleSchools.length >= PREVIEW_SAMPLE_COUNT) break;
      const name = (row['\u5b78\u6821\u540d\u7a31'] ?? '').trim();
      const county = (row['\u7e23\u5e02\u540d\u7a31'] ?? '').trim();
      if (name) {
        sampleSchools.push({ name, county });
      }
    }

    // Compute coordinate bounding box from valid numeric values.
    let latMin = Infinity;
    let latMax = -Infinity;
    let lonMin = Infinity;
    let lonMax = -Infinity;
    let hasCoords = false;

    for (const row of data) {
      const lat = parseFloat(row['\u7def\u5ea6']);
      const lon = parseFloat(row['\u7d93\u5ea6']);
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        hasCoords = true;
        if (lat < latMin) latMin = lat;
        if (lat > latMax) latMax = lat;
        if (lon < lonMin) lonMin = lon;
        if (lon > lonMax) lonMax = lon;
      }
    }

    const coordinateBounds = hasCoords
      ? { latMin, latMax, lonMin, lonMax }
      : null;

    return { totalRows, sampleSchools, coordinateBounds };
  } catch {
    return null;
  }
}
