import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchWithRetry } from './fetch-utils.js';

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
});
