import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchWithTimeout } from './fetchWithTimeout.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const okResponse = (body = '') =>
  new Response(body, { status: 200, statusText: 'OK' });

const errorResponse = (status = 500) =>
  new Response('', { status, statusText: 'Internal Server Error' });

/** A fetch mock that never resolves but rejects on signal abort. */
const hangingFetch = (_url, opts) =>
  new Promise((_resolve, reject) => {
    const onAbort = () =>
      reject(new DOMException('The operation was aborted.', 'AbortError'));
    if (opts?.signal?.aborted) {
      onAbort();
      return;
    }
    opts?.signal?.addEventListener('abort', onAbort);
  });

/* ------------------------------------------------------------------ */
/*  Setup / teardown                                                    */
/* ------------------------------------------------------------------ */

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

/* ------------------------------------------------------------------ */
/*  Tests                                                               */
/* ------------------------------------------------------------------ */

describe('fetchWithTimeout', () => {
  it('returns a successful response on the first attempt', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(okResponse('hello'));

    const res = await fetchWithTimeout('https://example.com/data.csv');
    expect(res.ok).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('retries on HTTP error and succeeds on a later attempt', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(errorResponse(502))
      .mockResolvedValueOnce(okResponse('ok'));

    const res = await fetchWithTimeout('https://example.com/data.csv');
    expect(res.ok).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('throws after all retries are exhausted', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(errorResponse(503));

    await expect(
      fetchWithTimeout('https://example.com/data.csv', { retries: 1 }),
    ).rejects.toThrow('HTTP 503');
    // initial + 1 retry = 2 calls
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('retries on network error and eventually succeeds', async () => {
    globalThis.fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(okResponse('recovered'));

    const res = await fetchWithTimeout('https://example.com/data.csv');
    expect(res.ok).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('throws a TimeoutError when the request exceeds the timeout', async () => {
    globalThis.fetch = vi.fn().mockImplementation(hangingFetch);

    await expect(
      fetchWithTimeout('https://example.com/data.csv', {
        timeout: 10,
        retries: 0,
      }),
    ).rejects.toMatchObject({ name: 'TimeoutError' });
  });

  it('retries on timeout then succeeds', async () => {
    globalThis.fetch = vi
      .fn()
      .mockImplementationOnce(hangingFetch)
      .mockResolvedValueOnce(okResponse('ok'));

    const res = await fetchWithTimeout('https://example.com/data.csv', {
      timeout: 10,
    });
    expect(res.ok).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('throws AbortError when the external signal is aborted', async () => {
    const externalController = new AbortController();
    globalThis.fetch = vi.fn().mockImplementation(hangingFetch);

    const promise = fetchWithTimeout('https://example.com/data.csv', {
      timeout: 5000,
      signal: externalController.signal,
    });

    // Simulate React unmount.
    externalController.abort();

    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    // External abort is final — no retry.
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('throws AbortError immediately when signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    globalThis.fetch = vi.fn();

    await expect(
      fetchWithTimeout('https://example.com/data.csv', {
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('respects custom retries count', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(errorResponse(500));

    await expect(
      fetchWithTimeout('https://example.com/data.csv', { retries: 3 }),
    ).rejects.toThrow();
    // initial + 3 retries = 4 calls
    expect(globalThis.fetch).toHaveBeenCalledTimes(4);
  });
});
