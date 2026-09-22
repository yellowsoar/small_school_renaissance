import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchWithRetry, validateCsvContent, verifyCsvIntegrity } from './fetch-utils.js';
import {
  REQUIRED_HEADERS,
  FIRST_PROJECTION_YEAR,
  LAST_PROJECTION_YEAR,
} from '../src/lib/csv-schema.js';

describe('fetchWithRetry', () => {
  const url = 'https://example.com/data.csv';
  let originalFetch;

  /**
   * Helper: create a mock Response-like object for successful fetch.
   * Provides `.ok`, `.status`, `.headers`, `.text()`, and `.arrayBuffer()`
   * needed by fetchWithRetry which reads body via the shared
   * readBodyWithLimit module (#274).  The fallback path uses
   * arrayBuffer() when response.body is falsy (plain object mocks).
   */
  const okResponse = (body = 'csv-data', contentType = 'text/csv') => {
    const encoded = new TextEncoder().encode(body);
    return {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': contentType }),
      text: vi.fn().mockResolvedValue(body),
      arrayBuffer: vi.fn().mockResolvedValue(encoded.buffer),
    };
  };

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('returns { body, contentType } on a successful first attempt', async () => {
    const mockRes = okResponse('my-csv', 'text/csv');
    globalThis.fetch = vi.fn().mockResolvedValue(mockRes);

    const res = await fetchWithRetry(url, { retries: 2, timeout: 1000 });

    expect(res).toEqual({ body: 'my-csv', contentType: 'text/csv' });
    // Body read goes through arrayBuffer() fallback (mock has no ReadableStream body).
    expect(mockRes.arrayBuffer).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).toHaveBeenCalledWith(url, {
      signal: expect.any(AbortSignal),
    });
  });

  it('retries on HTTP error and succeeds on second attempt', async () => {
    const fail = { ok: false, status: 503, statusText: 'Service Unavailable' };
    const ok = okResponse();
    globalThis.fetch = vi.fn().mockResolvedValueOnce(fail).mockResolvedValueOnce(ok);

    const res = await fetchWithRetry(url, { retries: 2, timeout: 1000 });

    expect(res).toEqual({ body: 'csv-data', contentType: 'text/csv' });
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it('throws after all retries are exhausted (HTTP error)', async () => {
    const fail = { ok: false, status: 500, statusText: 'Internal Server Error' };
    globalThis.fetch = vi.fn().mockResolvedValue(fail);

    await expect(fetchWithRetry(url, { retries: 1, timeout: 1000 })).rejects.toThrow(
      'HTTP 500 Internal Server Error',
    );
    // initial + 1 retry = 2 calls
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('retries on network error and throws when exhausted', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed'));

    await expect(fetchWithRetry(url, { retries: 1, timeout: 1000 })).rejects.toThrow(
      'fetch failed',
    );
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it('surfaces TimeoutError without retry when retries=0', async () => {
    const timeoutErr = new DOMException('Signal timed out.', 'TimeoutError');
    globalThis.fetch = vi.fn().mockRejectedValue(timeoutErr);

    await expect(fetchWithRetry(url, { retries: 0, timeout: 1 })).rejects.toThrow();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('logs "timeout" label for TimeoutError during retry', async () => {
    const timeoutErr = new DOMException('Signal timed out.', 'TimeoutError');
    const ok = okResponse();
    globalThis.fetch = vi.fn().mockRejectedValueOnce(timeoutErr).mockResolvedValueOnce(ok);

    const res = await fetchWithRetry(url, { retries: 1, timeout: 1 });

    expect(res).toEqual({ body: 'csv-data', contentType: 'text/csv' });
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('timeout'));
  });

  it('does not retry when retries=0 and HTTP fails', async () => {
    const fail = { ok: false, status: 404, statusText: 'Not Found' };
    globalThis.fetch = vi.fn().mockResolvedValue(fail);

    await expect(fetchWithRetry(url, { retries: 0 })).rejects.toThrow('HTTP 404 Not Found');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('uses default retries=2 and timeout=30000', async () => {
    const ok = okResponse();
    globalThis.fetch = vi.fn().mockResolvedValue(ok);

    await fetchWithRetry(url);

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).toHaveBeenCalledWith(url, {
      signal: expect.any(AbortSignal),
    });
  });

  /* -------------------------------------------------------------- */
  /*  4xx non-retriable behavior (#43)                                */
  /* -------------------------------------------------------------- */

  it('does not retry on 4xx client error (e.g. 404)', async () => {
    const notFound = { ok: false, status: 404, statusText: 'Not Found' };
    globalThis.fetch = vi.fn().mockResolvedValue(notFound);

    await expect(fetchWithRetry(url, { retries: 2, timeout: 1000 })).rejects.toThrow(
      'HTTP 404 Not Found',
    );
    // No retries -- only the initial attempt.
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('still retries on 5xx server error after 4xx skip logic', async () => {
    const fail = { ok: false, status: 502, statusText: 'Bad Gateway' };
    const ok = okResponse();
    globalThis.fetch = vi.fn().mockResolvedValueOnce(fail).mockResolvedValueOnce(ok);

    const res = await fetchWithRetry(url, { retries: 2, timeout: 1000 });

    expect(res).toEqual({ body: 'csv-data', contentType: 'text/csv' });
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  /* -------------------------------------------------------------- */
  /*  429 retriable behavior (#110)                                    */
  /* -------------------------------------------------------------- */

  it('retries on 429 Too Many Requests', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const rateLimited = new Response('', {
      status: 429,
      statusText: 'Too Many Requests',
    });
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(rateLimited)
      .mockResolvedValueOnce(
        new Response('ok', { status: 200, statusText: 'OK' }),
      );

    const res = await fetchWithRetry(url, { retries: 2, timeout: 1000 });

    expect(res.body).toBe('ok');
    // 429 is retriable -- two calls (initial + retry).
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it('throws after retries exhausted on repeated 429', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response('', { status: 429, statusText: 'Too Many Requests' }),
      ),
    );

    await expect(
      fetchWithRetry(url, { retries: 1, timeout: 1000 }),
    ).rejects.toThrow('HTTP 429');
    // initial + 1 retry = 2 calls (not 1 like non-retriable 4xx).
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('still does not retry on other 4xx after 429 carve-out', async () => {
    const forbidden = { ok: false, status: 403, statusText: 'Forbidden' };
    globalThis.fetch = vi.fn().mockResolvedValue(forbidden);

    await expect(
      fetchWithRetry(url, { retries: 2, timeout: 1000 }),
    ).rejects.toThrow('HTTP 403 Forbidden');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('includes Retry-After delay in console.warn message on 429', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);

    // Use 5 s (under the 30 s MAX_RETRY_AFTER_MS cap) so the retry
    // path fires and console.warn is called.
    const rateLimited = new Response('', {
      status: 429,
      statusText: 'Too Many Requests',
      headers: { 'Retry-After': '5' },
    });
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(rateLimited)
      .mockResolvedValueOnce(
        new Response('ok', { status: 200, statusText: 'OK' }),
      );

    const promise = fetchWithRetry(url, { retries: 2, timeout: 1000 });
    await vi.runAllTimersAsync();
    await promise;

    // Retry-After: 5 = 5 000 ms; Math.max(0, 5000) = 5000.
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('5000'),
    );

    vi.useRealTimers();
  });

  /* -------------------------------------------------------------- */
  /*  Response body retry coverage (#211)                              */
  /* -------------------------------------------------------------- */

  it('retries when response body read fails (e.g. stream error)', async () => {
    // The shared readBodyWithLimit falls back to arrayBuffer() for mocks
    // without a ReadableStream body (#274).
    const failBody = {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/csv' }),
      arrayBuffer: vi.fn().mockRejectedValue(new Error('network error during body read')),
    };
    const okBody = okResponse('recovered-csv', 'text/csv');
    globalThis.fetch = vi.fn().mockResolvedValueOnce(failBody).mockResolvedValueOnce(okBody);

    const res = await fetchWithRetry(url, { retries: 2, timeout: 1000 });

    expect(res).toEqual({ body: 'recovered-csv', contentType: 'text/csv' });
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('network error during body read'),
    );
  });

  it('returns empty contentType when Content-Type header is absent', async () => {
    const body = 'col1,col2\na,b';
    const encoded = new TextEncoder().encode(body);
    const mockRes = {
      ok: true,
      status: 200,
      headers: new Headers(),
      arrayBuffer: vi.fn().mockResolvedValue(encoded.buffer),
    };
    globalThis.fetch = vi.fn().mockResolvedValue(mockRes);

    const res = await fetchWithRetry(url, { retries: 0 });

    expect(res).toEqual({ body: 'col1,col2\na,b', contentType: '' });
    expect(mockRes.arrayBuffer).toHaveBeenCalledTimes(1);
  });

  /* -------------------------------------------------------------- */
  /*  Response body size limit (#259)                                  */
  /* -------------------------------------------------------------- */

  it('rejects early via Content-Length when response exceeds maxBytes', async () => {
    const largeRes = {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/csv', 'content-length': '20000' }),
      arrayBuffer: vi.fn(),
    };
    globalThis.fetch = vi.fn().mockResolvedValue(largeRes);

    const err = await fetchWithRetry(url, { retries: 0, timeout: 1000, maxBytes: 100 })
      .catch((e) => e);

    expect(err.name).toBe('SizeLimitError');
    expect(err.message).toMatch(/20000 bytes exceeds limit of 100 bytes/);
    // arrayBuffer() should NOT have been called \u2014 early rejection via header.
    expect(largeRes.arrayBuffer).not.toHaveBeenCalled();
  });

  it('rejects via fallback post-check when body exceeds maxBytes (response.body is null)', async () => {
    const bigBody = 'x'.repeat(200);
    const encoded = new TextEncoder().encode(bigBody);
    const mockRes = {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/csv' }),
      arrayBuffer: vi.fn().mockResolvedValue(encoded.buffer),
      body: null,
    };
    globalThis.fetch = vi.fn().mockResolvedValue(mockRes);

    const err = await fetchWithRetry(url, { retries: 0, timeout: 1000, maxBytes: 100 })
      .catch((e) => e);

    expect(err.name).toBe('SizeLimitError');
    expect(err.message).toMatch(/200 bytes exceeds limit of 100 bytes/);
    // arrayBuffer() was called, confirming fallback path was exercised.
    expect(mockRes.arrayBuffer).toHaveBeenCalledTimes(1);
  });

  it('accepts response within maxBytes limit', async () => {
    const smallBody = 'col1,col2\na,b';
    const encoded = new TextEncoder().encode(smallBody);
    const mockRes = {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/csv' }),
      arrayBuffer: vi.fn().mockResolvedValue(encoded.buffer),
      body: null,
    };
    globalThis.fetch = vi.fn().mockResolvedValue(mockRes);

    const res = await fetchWithRetry(url, { retries: 0, timeout: 1000, maxBytes: 10000 });

    expect(res).toEqual({ body: smallBody, contentType: 'text/csv' });
  });

  it('does not retry SizeLimitError (retriable: false)', async () => {
    const largeRes = {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/csv', 'content-length': '20000' }),
      arrayBuffer: vi.fn(),
    };
    globalThis.fetch = vi.fn().mockResolvedValue(largeRes);

    await expect(
      fetchWithRetry(url, { retries: 2, timeout: 1000, maxBytes: 100 }),
    ).rejects.toThrow('exceeds limit');
    // Only 1 call \u2014 SizeLimitError has retriable: false, no retries.
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('uses default maxBytes (10 MB) when not specified', async () => {
    // Normal-sized response passes with the default 10 MB ceiling.
    const ok = okResponse('small-csv', 'text/csv');
    globalThis.fetch = vi.fn().mockResolvedValue(ok);

    const res = await fetchWithRetry(url, { retries: 0, timeout: 1000 });

    expect(res).toEqual({ body: 'small-csv', contentType: 'text/csv' });
  });

  it('enforces streaming size limit via response.body.getReader()', async () => {
    const encoder = new TextEncoder();
    const bigChunk = encoder.encode('x'.repeat(200));
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(bigChunk);
        controller.close();
      },
    });
    const mockRes = new Response(stream, {
      status: 200,
      headers: { 'content-type': 'text/csv' },
    });
    globalThis.fetch = vi.fn().mockResolvedValue(mockRes);

    const err = await fetchWithRetry(url, { retries: 0, timeout: 1000, maxBytes: 100 })
      .catch((e) => e);

    expect(err.name).toBe('SizeLimitError');
    expect(err.message).toMatch(/exceeds limit of 100 bytes/);
  });
});

describe('validateCsvContent', () => {
  // Programmatically generate valid header and CSV from REQUIRED_HEADERS
  // so the fixture stays in sync with the expanded projection columns (#194).
  const EXTRA_COLUMNS = ['\u9109\u93ae\u5e02\u5340', '\u5730\u5740', '\u96fb\u8a71', '\u7db2\u5740', '\u5730\u5340\u5c6c\u6027', '\u5b78\u751f\u4eba\u6578'];
  const ALL_COLUMNS = [...REQUIRED_HEADERS, ...EXTRA_COLUMNS];
  const VALID_HEADER = ALL_COLUMNS.join(',');
  const VALID_DATA_VALUES = [
    '013501', '\u5927\u540c\u570b\u5c0f', '\u81fa\u5317\u5e02',  // \u5b78\u6821\u4ee3\u78bc, \u5b78\u6821\u540d\u7a31, \u7e23\u5e02\u540d\u7a31
    '25.05', '121.52',               // \u7def\u5ea6, \u7d93\u5ea6
    ...Array(LAST_PROJECTION_YEAR - FIRST_PROJECTION_YEAR + 1).fill('280'), // \u63a8\u4f30 columns
    '\u4e2d\u5c71\u5340', '\u4e2d\u5c71\u5317\u8def', '02-1234', 'http://example.com', '\u4e00\u822c\u5730\u5340', '300', // extras
  ];
  const VALID_DATA_ROW = VALID_DATA_VALUES.join(',');
  // Use 100 data rows so the fixture also satisfies the MIN_DATA_ROWS
  // truncation guard introduced in #203.
  const VALID_CSV = [VALID_HEADER, ...Array(100).fill(VALID_DATA_ROW)].join('\n');

  it('accepts a valid CSV with required headers and data rows', () => {
    expect(() => validateCsvContent(VALID_CSV)).not.toThrow();
  });

  it('throws on empty string', () => {
    expect(() => validateCsvContent('')).toThrow('downloaded content is empty');
  });

  it('throws on whitespace-only string', () => {
    expect(() => validateCsvContent('   \n  ')).toThrow('downloaded content is empty');
  });

  it('throws on null/undefined', () => {
    expect(() => validateCsvContent(null)).toThrow('downloaded content is empty');
    expect(() => validateCsvContent(undefined)).toThrow('downloaded content is empty');
  });

  it('throws when content is HTML (error page)', () => {
    const html = '<!DOCTYPE html><html><body>404 Not Found</body></html>';
    expect(() => validateCsvContent(html)).toThrow('appears to be HTML');
  });

  it('throws when content is HTML with leading whitespace', () => {
    const html = '  <html><body>Login required</body></html>';
    expect(() => validateCsvContent(html)).toThrow('appears to be HTML');
  });

  it('throws when required headers are missing', () => {
    const bad = 'col_a,col_b,col_c\n1,2,3';
    expect(() => validateCsvContent(bad)).toThrow('CSV header missing required columns');
    expect(() => validateCsvContent(bad)).toThrow('\u5b78\u6821\u4ee3\u78bc');
  });

  it('throws when only some required headers are present', () => {
    const partial = '\u5b78\u6821\u4ee3\u78bc,\u5b78\u6821\u540d\u7a31,foo\n1,test,bar';
    expect(() => validateCsvContent(partial)).toThrow('\u7def\u5ea6');
  });

  it('throws when CSV has a header but no data rows', () => {
    expect(() => validateCsvContent(VALID_HEADER)).toThrow('no data rows');
  });

  it('accepts custom required headers', () => {
    const rows = Array(100).fill('1,2');
    const csv = ['alpha,beta', ...rows].join('\n');
    expect(() => validateCsvContent(csv, ['alpha', 'beta'])).not.toThrow();
  });

  it('includes the actual header in the error message for diagnosis', () => {
    const bad = 'wrong_col_1,wrong_col_2\n1,2';
    try {
      validateCsvContent(bad);
    } catch (err) {
      expect(err.message).toContain('wrong_col_1');
    }
  });

  it('truncates long headers to 120 chars in the error message', () => {
    const longHeader = 'x'.repeat(200);
    const csv = `${longHeader}\ndata`;
    try {
      validateCsvContent(csv);
    } catch (err) {
      // The truncated portion should end with ... and not contain the full 200-char string
      expect(err.message.length).toBeLessThan(400);
    }
  });

  /* -------------------------------------------------------------- */
  /*  Column-level match regression tests (#67)                       */
  /* -------------------------------------------------------------- */

  it('rejects substring collision: "\u5927\u7def\u5ea6\u8a08" does not satisfy "\u7def\u5ea6" requirement', () => {
    const csv = '\u5b78\u6821\u4ee3\u78bc,\u5b78\u6821\u540d\u7a31,\u7e23\u5e02\u540d\u7a31,\u5927\u7def\u5ea6\u8a08,\u7d93\u5ea6,\u63a8\u4f30114\u5e74\u4eba\u6578\n1,test,city,25,121,100';
    expect(() => validateCsvContent(csv)).toThrow('\u7def\u5ea6');
  });

  it('accepts quoted CSV headers after unquoting', () => {
    const quotedHeader = ALL_COLUMNS.map((col) => `"${col}"`).join(',');
    const rows = Array(100).fill(VALID_DATA_ROW);
    const csv = [quotedHeader, ...rows].join('\n');
    expect(() => validateCsvContent(csv)).not.toThrow();
  });

  /* -------------------------------------------------------------- */
  /*  Incomplete projection columns regression test (#194)             */
  /* -------------------------------------------------------------- */

  it('throws when only \u63a8\u4f30114\u5e74\u4eba\u6578 is present but \u63a8\u4f30115\u5e74\u4eba\u6578 is missing (#194)', () => {
    // Build a header with base columns + only the first projection column
    const incompleteHeader = [
      '\u5b78\u6821\u4ee3\u78bc', '\u5b78\u6821\u540d\u7a31', '\u7e23\u5e02\u540d\u7a31', '\u7def\u5ea6', '\u7d93\u5ea6', '\u63a8\u4f30114\u5e74\u4eba\u6578',
    ].join(',');
    const csv = `${incompleteHeader}\n013501,\u5927\u540c\u570b\u5c0f,\u81fa\u5317\u5e02,25.05,121.52,280`;
    expect(() => validateCsvContent(csv)).toThrow('CSV header missing required columns');
    expect(() => validateCsvContent(csv)).toThrow('\u63a8\u4f30115\u5e74\u4eba\u6578');
  });

  /* -------------------------------------------------------------- */
  /*  Minimum row threshold regression tests (#203)                    */
  /* -------------------------------------------------------------- */

  it('throws when CSV has fewer than 100 data rows (truncated download)', () => {
    const rows = Array(99).fill(VALID_DATA_ROW);
    const csv = [VALID_HEADER, ...rows].join('\n');
    expect(() => validateCsvContent(csv)).toThrow('truncated');
    expect(() => validateCsvContent(csv)).toThrow('99 data row(s)');
  });

  it('accepts CSV with exactly 100 data rows (at the threshold)', () => {
    const rows = Array(100).fill(VALID_DATA_ROW);
    const csv = [VALID_HEADER, ...rows].join('\n');
    expect(() => validateCsvContent(csv)).not.toThrow();
  });

  /* -------------------------------------------------------------- */
  /*  RFC 4180 multiline field handling (#209)                         */
  /* -------------------------------------------------------------- */

  it('rejects CSV where multiline quoted fields inflate physical line count above threshold (#209)', () => {
    // 50 actual records, each with a quoted field containing 2 embedded
    // newlines -> physical line count = 1 (header) + 50 * 3 = 151, which
    // would pass the old split('\n') check but must fail the record-based
    // count (50 < MIN_DATA_ROWS).
    const multilineRow = '"value_a","line1\nline2\nline3"';
    const rows = Array(50).fill(multilineRow);
    const csv = ['alpha,beta', ...rows].join('\n');
    expect(() => validateCsvContent(csv, ['alpha', 'beta'])).toThrow('50 data row(s)');
    expect(() => validateCsvContent(csv, ['alpha', 'beta'])).toThrow('truncated');
  });

  it('accepts CSV with multiline quoted fields when actual record count meets threshold (#209)', () => {
    // 100 actual records with an embedded newline in a quoted field.
    const multilineRow = '"value_a","line1\nline2"';
    const rows = Array(100).fill(multilineRow);
    const csv = ['alpha,beta', ...rows].join('\n');
    expect(() => validateCsvContent(csv, ['alpha', 'beta'])).not.toThrow();
  });

  /* -------------------------------------------------------------- */
  /*  Structural parse error validation (#311)                         */
  /* -------------------------------------------------------------- */

  it('throws when CSV has critical structural errors above 1% threshold (#311)', () => {
    // Build a CSV with valid headers but 5% of rows having too few fields.
    // 100 rows total, 5 with TooFewFields (missing last column) = 5% > 1%.
    const header = 'alpha,beta,gamma';
    const goodRow = 'a,b,c';
    const badRow = 'a,b'; // TooFewFields: only 2 columns instead of 3
    const rows = [
      ...Array(95).fill(goodRow),
      ...Array(5).fill(badRow),
    ];
    const csv = [header, ...rows].join('\n');
    expect(() => validateCsvContent(csv, ['alpha', 'beta', 'gamma'])).toThrow(
      'structural errors exceed threshold',
    );
    expect(() => validateCsvContent(csv, ['alpha', 'beta', 'gamma'])).toThrow(
      'TooFewFields',
    );
  });

  it('accepts CSV with critical structural errors below 1% threshold (#311)', () => {
    // Build a CSV with valid headers but < 1% of rows having too few fields.
    // 200 rows total, 1 with TooFewFields = 0.5% < 1%.
    const header = 'alpha,beta,gamma';
    const goodRow = 'a,b,c';
    const badRow = 'a,b'; // TooFewFields
    const rows = [
      ...Array(199).fill(goodRow),
      badRow,
    ];
    const csv = [header, ...rows].join('\n');
    expect(() => validateCsvContent(csv, ['alpha', 'beta', 'gamma'])).not.toThrow();
  });
});

/* ------------------------------------------------------------------ */
/*  CSV integrity verification (#222)                                   */
/* ------------------------------------------------------------------ */

describe('verifyCsvIntegrity', () => {
  it('returns computed hash when it matches expectedHash', () => {
    const body = 'col1,col2\na,b\n';
    // Use the function itself with no expected hash to obtain the digest,
    // then verify the matching path returns the same value.
    const expected = verifyCsvIntegrity(body);

    const result = verifyCsvIntegrity(body, expected);
    expect(result).toBe(expected);
  });

  it('throws when computed hash does not match expectedHash', () => {
    const body = 'col1,col2\na,b\n';
    const wrongHash = 'deadbeef'.repeat(8); // 64-char hex, guaranteed mismatch

    expect(() => verifyCsvIntegrity(body, wrongHash)).toThrow('integrity check failed');
    expect(() => verifyCsvIntegrity(body, wrongHash)).toThrow(wrongHash);
  });

  it('returns computed hash without throwing when expectedHash is empty string', () => {
    const body = 'some,csv,data\n1,2,3\n';
    const result = verifyCsvIntegrity(body, '');

    expect(typeof result).toBe('string');
    expect(result).toHaveLength(64); // SHA-256 hex = 64 chars
  });

  it('returns computed hash without throwing when expectedHash is undefined', () => {
    const body = 'some,csv,data\n1,2,3\n';
    const result = verifyCsvIntegrity(body, undefined);

    expect(typeof result).toBe('string');
    expect(result).toHaveLength(64);
  });
});
