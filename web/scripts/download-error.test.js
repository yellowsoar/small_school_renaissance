import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchWithRetry, formatDownloadError } from './fetch-utils.js';

/* ------------------------------------------------------------------ */
/*  Accurate download failure diagnostics (#470)                        */
/* ------------------------------------------------------------------ */

describe('fetchWithRetry failure annotation (#470)', () => {
  const url = 'https://example.com/data.csv';
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Zero jitter so retry paths do not sleep in real time.
    vi.spyOn(Math, 'random').mockReturnValue(0);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('reports 1 attempt (non-retriable) for a 404, not "after 3 attempts"', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' });

    const err = await fetchWithRetry(url, { retries: 2, timeout: 1000 }).catch((e) => e);

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(err.attempts).toBe(1);
    const msg = formatDownloadError(err, 'download');
    expect(msg).toContain(
      'download failed after 1 attempt (non-retriable): HTTP 404 Not Found',
    );
    expect(msg).not.toContain('after 3');
  });

  it('reports the real attempt count when retries are exhausted', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 500, statusText: 'Internal Server Error' });

    const err = await fetchWithRetry(url, { retries: 1, timeout: 1000 }).catch((e) => e);

    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(err.attempts).toBe(2);
    const msg = formatDownloadError(err, 'download');
    expect(msg).toContain(
      'download failed after 2 attempts: HTTP 500 Internal Server Error',
    );
    expect(msg).not.toContain('non-retriable');
  });

  it('uses the caller-supplied timeout instead of a hardcoded 30s', async () => {
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new DOMException('Signal timed out.', 'TimeoutError'));

    const err = await fetchWithRetry(url, { retries: 0, timeout: 2000 }).catch((e) => e);

    expect(err.timeoutMs).toBe(2000);
    const msg = formatDownloadError(err, 'boundary data download');
    expect(msg).toContain(
      'boundary data download failed after 1 attempt: timeout after 2s',
    );
    expect(msg).not.toContain('30s');
  });

  it('flags a Retry-After over the cap on the 2nd attempt as non-retriable after 2 attempts', async () => {
    vi.useFakeTimers();
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('', {
          status: 429,
          statusText: 'Too Many Requests',
          headers: { 'Retry-After': '5' },
        }),
      )
      .mockResolvedValueOnce(
        new Response('', {
          status: 429,
          statusText: 'Too Many Requests',
          headers: { 'Retry-After': '60' },
        }),
      );

    const promise = fetchWithRetry(url, { retries: 2, timeout: 1000 }).catch((e) => e);
    await vi.runAllTimersAsync();
    const err = await promise;

    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(err.attempts).toBe(2);
    expect(err.retriable).toBe(false);
    expect(formatDownloadError(err)).toContain(
      'download failed after 2 attempts (non-retriable): HTTP 429 Too Many Requests',
    );
  });

  it('reports SizeLimitError as a single non-retriable attempt', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/csv', 'content-length': '20000' }),
      arrayBuffer: vi.fn(),
    });

    const err = await fetchWithRetry(url, { retries: 2, timeout: 1000, maxBytes: 100 })
      .catch((e) => e);

    expect(err.name).toBe('SizeLimitError');
    expect(err.attempts).toBe(1);
    expect(formatDownloadError(err)).toContain('after 1 attempt (non-retriable)');
  });
});

describe('formatDownloadError (#470)', () => {
  it('omits attempt context for errors not annotated by fetchWithRetry', () => {
    expect(formatDownloadError(new Error('boom'), 'boundary data download')).toBe(
      '\u274c boundary data download failed: boom',
    );
  });

  it('falls back to plain "timeout" when no timeout value is recorded', () => {
    const err = new DOMException('Signal timed out.', 'TimeoutError');
    expect(formatDownloadError(err)).toBe('\u274c download failed: timeout');
  });

  it('defaults the label to "download"', () => {
    const err = Object.assign(new Error('HTTP 503 Service Unavailable'), { attempts: 3 });
    expect(formatDownloadError(err)).toBe(
      '\u274c download failed after 3 attempts: HTTP 503 Service Unavailable',
    );
  });
});
