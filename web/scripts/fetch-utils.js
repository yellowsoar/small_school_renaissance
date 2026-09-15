/**
 * Fetch utilities for build-time scripts.
 *
 * Relies on AbortSignal.timeout() — requires Node.js >= 20.
 */

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RETRIES = 2;

/**
 * Required CSV headers that the downstream parseSchools() depends on.
 * If any are missing the dataset is structurally incompatible and should
 * be rejected at download time rather than producing a silent empty map.
 */
const DEFAULT_REQUIRED_HEADERS = ['學校代碼', '學校名稱', '緯度', '經度'];

/* ------------------------------------------------------------------ */
/*  Backoff helpers                                                     */
/* ------------------------------------------------------------------ */

const BACKOFF_BASE_MS = 1_000;
const BACKOFF_CAP_MS = 10_000;

/**
 * Full-jitter exponential backoff (AWS Architecture Blog recommended).
 *
 * @param {number} attempt  Zero-based retry index
 * @param {number} [base]   Base delay in ms (default 1 000)
 * @param {number} [cap]    Maximum ceiling in ms (default 10 000)
 * @returns {number} Delay in ms
 */
function fullJitter(attempt, base = BACKOFF_BASE_MS, cap = BACKOFF_CAP_MS) {
  const ceiling = Math.min(cap, base * 2 ** attempt);
  return Math.random() * ceiling;
}

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
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    } catch (err) {
      if (attempt === retries) throw err;
      const label = err.name === 'TimeoutError' ? 'timeout' : err.message;
      const delay = fullJitter(attempt);
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
 * 3. The header line contains all `requiredHeaders`.
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
  requiredHeaders = DEFAULT_REQUIRED_HEADERS,
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

  const missing = requiredHeaders.filter((col) => !firstLine.includes(col));
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
