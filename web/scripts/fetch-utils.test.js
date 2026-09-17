import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchWithRetry, validateCsvContent } from './fetch-utils.js';

describe('fetchWithRetry', () => {
  const url = 'https://example.com/data.csv';
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('returns the response on a successful first attempt', async () => {
    const mockRes = { ok: true, status: 200 };
    globalThis.fetch = vi.fn().mockResolvedValue(mockRes);

    const res = await fetchWithRetry(url, { retries: 2, timeout: 1000 });

    expect(res).toBe(mockRes);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).toHaveBeenCalledWith(url, {
      signal: expect.any(AbortSignal),
    });
  });

  it('retries on HTTP error and succeeds on second attempt', async () => {
    const fail = { ok: false, status: 503, statusText: 'Service Unavailable' };
    const ok = { ok: true, status: 200 };
    globalThis.fetch = vi.fn().mockResolvedValueOnce(fail).mockResolvedValueOnce(ok);

    const res = await fetchWithRetry(url, { retries: 2, timeout: 1000 });

    expect(res).toBe(ok);
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
    const ok = { ok: true, status: 200 };
    globalThis.fetch = vi.fn().mockRejectedValueOnce(timeoutErr).mockResolvedValueOnce(ok);

    const res = await fetchWithRetry(url, { retries: 1, timeout: 1 });

    expect(res).toBe(ok);
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
    const ok = { ok: true, status: 200 };
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
    // No retries — only the initial attempt.
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('still retries on 5xx server error after 4xx skip logic', async () => {
    const fail = { ok: false, status: 502, statusText: 'Bad Gateway' };
    const ok = { ok: true, status: 200 };
    globalThis.fetch = vi.fn().mockResolvedValueOnce(fail).mockResolvedValueOnce(ok);

    const res = await fetchWithRetry(url, { retries: 2, timeout: 1000 });

    expect(res).toBe(ok);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(console.warn).toHaveBeenCalledTimes(1);
  });
});

describe('validateCsvContent', () => {
  const VALID_HEADER =
    '學校代碼,學校名稱,縣市名稱,鄉鎮市區,地址,電話,網址,地區屬性,緯度,經度,學生人數,推估114年人數';
  const VALID_CSV = `${VALID_HEADER}\n013501,大同國小,臺北市,中山區,中山北路,02-1234,http://example.com,一般地區,25.05,121.52,300,280`;

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
    const csv = 'alpha,beta\n1,2';
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
      // The truncated portion should end with … and not contain the full 200-char string
      expect(err.message.length).toBeLessThan(400);
    }
  });

  /* -------------------------------------------------------------- */
  /*  Column-level match regression tests (#67)                       */
  /* -------------------------------------------------------------- */

  it('rejects substring collision: "大緯度計" does not satisfy "緯度" requirement', () => {
    // "大緯度計" contains "緯度" as a substring but is a different column.
    // The old `firstLine.includes(col)` would pass; column-level match must reject.
    const csv = '學校代碼,學校名稱,縣市名稱,大緯度計,經度,推估114年人數\n1,test,city,25,121,100';
    expect(() => validateCsvContent(csv)).toThrow('緯度');
  });

  it('accepts quoted CSV headers after unquoting', () => {
    const csv = '"學校代碼","學校名稱","縣市名稱","緯度","經度","推估114年人數"\n1,test,city,25,121,100';
    expect(() => validateCsvContent(csv)).not.toThrow();
  });
});
