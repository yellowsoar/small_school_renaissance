import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

/**
 * A fetch mock whose headers arrive immediately but whose body never
 * completes.  The body .text() rejects with AbortError when the fetch
 * signal fires, mirroring real browser behavior where the body stream
 * is wired to the fetch AbortController.
 */
const stalledBodyFetch = (_url, opts) => {
  const signal = opts?.signal;
  return Promise.resolve({
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Headers(),
    text: () =>
      new Promise((_resolve, reject) => {
        const onAbort = () =>
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        if (signal?.aborted) {
          onAbort();
          return;
        }
        signal?.addEventListener('abort', onAbort, { once: true });
        // Never resolves — simulates stalled body transfer.
      }),
  });
};

/* ------------------------------------------------------------------ */
/*  Setup / teardown                                                    */
/* ------------------------------------------------------------------ */

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

/* ------------------------------------------------------------------ */
/*  Tests                                                               */
/* ------------------------------------------------------------------ */

describe('fetchWithTimeout', () => {
  // Minimise backoff delays in non-backoff tests so they complete quickly.
  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
  });

  it('returns response body as text (#173)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(okResponse('hello'));

    const text = await fetchWithTimeout('https://example.com/data.csv');
    expect(typeof text).toBe('string');
    expect(text).toBe('hello');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('retries on HTTP error and succeeds on a later attempt', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(errorResponse(502))
      .mockResolvedValueOnce(okResponse('ok'));

    const text = await fetchWithTimeout('https://example.com/data.csv');
    expect(text).toBe('ok');
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

    const text = await fetchWithTimeout('https://example.com/data.csv');
    expect(text).toBe('recovered');
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

  it('times out when response body transfer stalls (#173)', async () => {
    globalThis.fetch = vi.fn().mockImplementation(stalledBodyFetch);

    await expect(
      fetchWithTimeout('https://example.com/data.csv', {
        timeout: 50,
        retries: 0,
      }),
    ).rejects.toMatchObject({ name: 'TimeoutError' });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('retries on timeout then succeeds', async () => {
    globalThis.fetch = vi
      .fn()
      .mockImplementationOnce(hangingFetch)
      .mockResolvedValueOnce(okResponse('ok'));

    const text = await fetchWithTimeout('https://example.com/data.csv', {
      timeout: 10,
    });
    expect(text).toBe('ok');
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

  /* -------------------------------------------------------------- */
  /*  4xx non-retriable behavior (#43)                                */
  /* -------------------------------------------------------------- */

  it('does not retry on 404 Not Found', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response('', { status: 404, statusText: 'Not Found' }),
    );

    await expect(
      fetchWithTimeout('https://example.com/data.csv', { retries: 2 }),
    ).rejects.toThrow('HTTP 404 Not Found');
    // No retries — only the initial attempt.
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('does not retry on 403 Forbidden', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response('', { status: 403, statusText: 'Forbidden' }),
    );

    await expect(
      fetchWithTimeout('https://example.com/data.csv', { retries: 2 }),
    ).rejects.toThrow('HTTP 403 Forbidden');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('still retries on 5xx server error after 4xx skip logic', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(errorResponse(502))
      .mockResolvedValueOnce(okResponse('recovered'));

    const text = await fetchWithTimeout('https://example.com/data.csv');
    expect(text).toBe('recovered');
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  /* -------------------------------------------------------------- */
  /*  429 retriable behavior (#110)                                    */
  /* -------------------------------------------------------------- */

  it('retries on 429 Too Many Requests', async () => {
    const rateLimited = new Response('', {
      status: 429,
      statusText: 'Too Many Requests',
    });
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(rateLimited)
      .mockResolvedValueOnce(okResponse('ok'));

    const text = await fetchWithTimeout('https://example.com/data.csv');
    expect(text).toBe('ok');
    // 429 is retriable — two calls (initial + retry).
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('throws after retries exhausted on repeated 429', async () => {
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response('', { status: 429, statusText: 'Too Many Requests' }),
      ),
    );

    await expect(
      fetchWithTimeout('https://example.com/data.csv', { retries: 1 }),
    ).rejects.toThrow('HTTP 429');
    // initial + 1 retry = 2 calls (not 1 like non-retriable 4xx).
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('still does not retry on other 4xx after 429 carve-out', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response('', { status: 400, statusText: 'Bad Request' }),
    );

    await expect(
      fetchWithTimeout('https://example.com/data.csv', { retries: 2 }),
    ).rejects.toThrow('HTTP 400 Bad Request');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  /* -------------------------------------------------------------- */
  /*  onRetry diagnostic logging (#186)                                */
  /* -------------------------------------------------------------- */

  it('logs a console.warn on each retry attempt (#186)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(errorResponse(502))
      .mockResolvedValueOnce(errorResponse(503))
      .mockResolvedValueOnce(okResponse('ok'));

    const text = await fetchWithTimeout('https://example.com/data.csv', {
      retries: 2,
    });
    expect(text).toBe('ok');

    // Two retries -> two console.warn calls.
    expect(warnSpy).toHaveBeenCalledTimes(2);

    // First retry: attempt 1/3 failed (HTTP 502 ...).
    expect(warnSpy.mock.calls[0][0]).toMatch(
      /\[fetchWithTimeout\] attempt 1\/3 failed \(HTTP 502/,
    );
    expect(warnSpy.mock.calls[0][0]).toMatch(/retrying in \d+ms/);

    // Second retry: attempt 2/3 failed (HTTP 503 ...).
    expect(warnSpy.mock.calls[1][0]).toMatch(
      /\[fetchWithTimeout\] attempt 2\/3 failed \(HTTP 503/,
    );
  });

  it('logs "timeout" label when retry is caused by a timeout (#186)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    globalThis.fetch = vi
      .fn()
      .mockImplementationOnce(hangingFetch)
      .mockResolvedValueOnce(okResponse('ok'));

    const text = await fetchWithTimeout('https://example.com/data.csv', {
      timeout: 10,
      retries: 1,
    });
    expect(text).toBe('ok');

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toMatch(
      /\[fetchWithTimeout\] attempt 1\/2 failed \(timeout\)/,
    );
  });

  it('does not log console.warn when first attempt succeeds (#186)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    globalThis.fetch = vi.fn().mockResolvedValue(okResponse('ok'));

    await fetchWithTimeout('https://example.com/data.csv');

    expect(warnSpy).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ */
/*  Backoff behavior (fake timers for precise control)                   */
/* ------------------------------------------------------------------ */

describe('backoff behavior', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('does not sleep when the first attempt succeeds', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    globalThis.fetch = vi.fn().mockResolvedValue(okResponse('ok'));
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

    const text = await fetchWithTimeout('https://example.com/data.csv');
    expect(text).toBe('ok');

    // Only the per-request timeout timer should be scheduled, not a backoff sleep.
    const backoffCalls = setTimeoutSpy.mock.calls.filter(
      ([, ms]) => ms !== 15_000,
    );
    expect(backoffCalls).toHaveLength(0);
  });

  it('sleeps between retries with full-jitter delay', async () => {
    // Math.random() = 0.5  ->  delay = 0.5 * min(10000, 1000 * 2^0) = 500ms
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(errorResponse(502))
      .mockResolvedValueOnce(okResponse('ok'));

    const promise = fetchWithTimeout('https://example.com/data.csv', {
      retries: 2,
    });

    // Let the first fetch resolve (error) and schedule the backoff timer.
    await vi.advanceTimersByTimeAsync(0);

    // The backoff sleep (500ms) should be pending; fetch not called again yet.
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    // Advance just short of the delay — still waiting.
    await vi.advanceTimersByTimeAsync(499);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    // Advance the final millisecond — retry fires.
    await vi.advanceTimersByTimeAsync(1);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);

    const text = await promise;
    expect(text).toBe('ok');
  });

  it('increases backoff ceiling on successive retries', async () => {
    // Math.random() = 1 (edge: maximum delay)
    // attempt 0: 1.0 * min(10000, 1000 * 1) = 1000ms
    // attempt 1: 1.0 * min(10000, 1000 * 2) = 2000ms
    vi.spyOn(Math, 'random').mockReturnValue(1);
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

    globalThis.fetch = vi.fn().mockResolvedValue(errorResponse(500));

    const promise = fetchWithTimeout('https://example.com/data.csv', {
      retries: 2,
    });

    // Attach rejection handler BEFORE draining timers to prevent unhandled rejection.
    const assertion = expect(promise).rejects.toThrow('HTTP 500');

    await vi.runAllTimersAsync();
    await assertion;

    // Extract backoff sleep durations (exclude the 15 000 ms request timeouts).
    const backoffDelays = setTimeoutSpy.mock.calls
      .map(([, ms]) => ms)
      .filter((ms) => ms !== 15_000);

    // Two retries -> two backoff sleeps.
    expect(backoffDelays).toHaveLength(2);
    expect(backoffDelays[0]).toBe(1000); // min(10000, 1000 * 2^0) * 1.0
    expect(backoffDelays[1]).toBe(2000); // min(10000, 1000 * 2^1) * 1.0
  });

  it('caps the backoff ceiling at 10 000 ms', async () => {
    // With attempt = 4, uncapped = 1000 * 2^4 = 16000, capped = 10000
    vi.spyOn(Math, 'random').mockReturnValue(1);
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

    globalThis.fetch = vi.fn().mockResolvedValue(errorResponse(500));

    const promise = fetchWithTimeout('https://example.com/data.csv', {
      retries: 5,
    });

    const assertion = expect(promise).rejects.toThrow();

    await vi.runAllTimersAsync();
    await assertion;

    const backoffDelays = setTimeoutSpy.mock.calls
      .map(([, ms]) => ms)
      .filter((ms) => ms !== 15_000);

    // Last delays should be capped at 10 000.
    expect(backoffDelays[3]).toBe(8000); // 1000 * 2^3 = 8000 (under cap)
    expect(backoffDelays[4]).toBe(10000); // 1000 * 2^4 = 16000 -> capped 10000
  });

  it('does not sleep after the last failed attempt', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

    globalThis.fetch = vi.fn().mockResolvedValue(errorResponse(500));

    const promise = fetchWithTimeout('https://example.com/data.csv', {
      retries: 1,
    });

    const assertion = expect(promise).rejects.toThrow();

    await vi.runAllTimersAsync();
    await assertion;

    // Only 1 backoff sleep (between attempt 0 and 1), not after the final failure.
    const backoffDelays = setTimeoutSpy.mock.calls
      .map(([, ms]) => ms)
      .filter((ms) => ms !== 15_000);
    expect(backoffDelays).toHaveLength(1);
  });

  it('aborts backoff sleep when the external signal fires', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const externalController = new AbortController();

    globalThis.fetch = vi.fn().mockResolvedValue(errorResponse(500));

    const promise = fetchWithTimeout('https://example.com/data.csv', {
      retries: 2,
      signal: externalController.signal,
    });

    // Let the first fetch resolve (error) and enter the backoff sleep.
    await vi.advanceTimersByTimeAsync(0);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    // Abort during the backoff sleep.
    externalController.abort();

    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    // No second fetch attempt — sleep was aborted.
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('does not sleep when retries is 0', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

    globalThis.fetch = vi.fn().mockResolvedValue(errorResponse(500));

    const promise = fetchWithTimeout('https://example.com/data.csv', {
      retries: 0,
    });

    const assertion = expect(promise).rejects.toThrow();

    await vi.runAllTimersAsync();
    await assertion;

    const backoffDelays = setTimeoutSpy.mock.calls
      .map(([, ms]) => ms)
      .filter((ms) => ms !== 15_000);
    expect(backoffDelays).toHaveLength(0);
  });

  /* -------------------------------------------------------------- */
  /*  429 Retry-After behavior (#110)                                  */
  /* -------------------------------------------------------------- */

  it('respects Retry-After header on 429, using server delay when larger than jitter', async () => {
    // fullJitter(0) = 0.5 * 1000 = 500ms, but Retry-After: 5 = 5000ms
    // Math.max(500, 5000) = 5000ms effective delay
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    globalThis.fetch = vi
      .fn()
      .mockImplementationOnce(() =>
        Promise.resolve(
          new Response('', {
            status: 429,
            statusText: 'Too Many Requests',
            headers: { 'Retry-After': '5' },
          }),
        ),
      )
      .mockResolvedValueOnce(okResponse('ok'));

    const promise = fetchWithTimeout('https://example.com/data.csv', {
      retries: 2,
    });

    // Let the first fetch resolve (429) and schedule the backoff timer.
    await vi.advanceTimersByTimeAsync(0);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    // Advance 4999ms — still waiting (Retry-After = 5s = 5000ms).
    await vi.advanceTimersByTimeAsync(4999);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    // Advance the final millisecond — retry fires.
    await vi.advanceTimersByTimeAsync(1);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);

    const text = await promise;
    expect(text).toBe('ok');
  });

  it('falls back to jitter delay on 429 without Retry-After header', async () => {
    // fullJitter(0) = 0.5 * 1000 = 500ms, no Retry-After -> 0
    // Math.max(500, 0) = 500ms effective delay
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    globalThis.fetch = vi
      .fn()
      .mockImplementationOnce(() =>
        Promise.resolve(
          new Response('', {
            status: 429,
            statusText: 'Too Many Requests',
          }),
        ),
      )
      .mockResolvedValueOnce(okResponse('ok'));

    const promise = fetchWithTimeout('https://example.com/data.csv', {
      retries: 2,
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    // Advance 499ms — still waiting.
    await vi.advanceTimersByTimeAsync(499);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    // Advance the final millisecond — retry fires.
    await vi.advanceTimersByTimeAsync(1);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);

    const text = await promise;
    expect(text).toBe('ok');
  });
});
