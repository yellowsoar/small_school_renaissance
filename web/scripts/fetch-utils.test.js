import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchWithRetry, validateCsvContent } from './fetch-utils.js';
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
   * Provides `.ok`, `.status`, `.headers`, and `.text()` needed by the
   * updated fetchWithRetry that reads body inside the retry loop (#211).
   */
  const okResponse = (body = 'csv-data', contentType = 'text/csv') => ({
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': contentType }),
    text: vi.fn().mockResolvedValue(body),
  });

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
    expect(mockRes.text).toHaveBeenCalledTimes(1);
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
    const failBody = {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/csv' }),
      text: vi.fn().mockRejectedValue(new Error('network error during body read')),
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
    const mockRes = {
      ok: true,
      status: 200,
      headers: new Headers(),
      text: vi.fn().mockResolvedValue('col1,col2\na,b'),
    };
    globalThis.fetch = vi.fn().mockResolvedValue(mockRes);

    const res = await fetchWithRetry(url, { retries: 0 });

    expect(res).toEqual({ body: 'col1,col2\na,b', contentType: '' });
    expect(mockRes.text).toHaveBeenCalledTimes(1);
  });
});

describe('validateCsvContent', () => {
  // Programmatically generate valid header and CSV from REQUIRED_HEADERS
  // so the fixture stays in sync with the expanded projection columns (#194).
  const EXTRA_COLUMNS = ['鄉鎮市區', '地址', '電話', '網址', '地區屬性', '學生人數'];
  const ALL_COLUMNS = [...REQUIRED_HEADERS, ...EXTRA_COLUMNS];
  const VALID_HEADER = ALL_COLUMNS.join(',');
  const VALID_DATA_VALUES = [
    '013501', '大同國小', '臺北市',  // 學校代碼, 學校名稱, 縣市名稱
    '25.05', '121.52',               // 緯度, 經度
    ...Array(LAST_PROJECTION_YEAR - FIRST_PROJECTION_YEAR + 1).fill('280'), // 推估 columns
    '中山區', '中山北路', '02-1234', 'http://example.com', '一般地區', '300', // extras
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
    expect(() => validateCsvContent(bad)).toThrow('學校代碼');
  });

  it('throws when only some required headers are present', () => {
    const partial = '學校代碼,學校名稱,foo\n1,test,bar';
    expect(() => validateCsvContent(partial)).toThrow('緯度');
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

  it('rejects substring collision: "大緯度計" does not satisfy "緯度" requirement', () => {
    const csv = '學校代碼,學校名稱,縣市名稱,大緯度計,經度,推估114年人數\n1,test,city,25,121,100';
    expect(() => validateCsvContent(csv)).toThrow('緯度');
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

  it('throws when only 推估114年人數 is present but 推估115年人數 is missing (#194)', () => {
    // Build a header with base columns + only the first projection column
    const incompleteHeader = [
      '學校代碼', '學校名稱', '縣市名稱', '緯度', '經度', '推估114年人數',
    ].join(',');
    const csv = `${incompleteHeader}\n013501,大同國小,臺北市,25.05,121.52,280`;
    expect(() => validateCsvContent(csv)).toThrow('CSV header missing required columns');
    expect(() => validateCsvContent(csv)).toThrow('推估115年人數');
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
});
