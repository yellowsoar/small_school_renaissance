import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { classifyResponse, withRetry, DEFAULT_RETRIES, MAX_RETRY_AFTER_MS } from './retry-core.js';

/* ------------------------------------------------------------------ */
/*  classifyResponse                                                    */
/* ------------------------------------------------------------------ */

describe('classifyResponse', () => {
  it('returns the response when ok', () => {
    const res = new Response('', { status: 200, statusText: 'OK' });
    expect(classifyResponse(res)).toBe(res);
  });

  it('throws retriable error with retryAfterMs on 429', () => {
    const res = new Response('', {
      status: 429,
      statusText: 'Too Many Requests',
      headers: { 'Retry-After': '5' },
    });
    try {
      classifyResponse(res);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err.message).toBe('HTTP 429 Too Many Requests');
      expect(err.retryAfterMs).toBe(5000);
      expect(err).not.toHaveProperty('retriable');
    }
  });

  it('returns retryAfterMs 0 on 429 without Retry-After header', () => {
    const res = new Response('', {
      status: 429,
      statusText: 'Too Many Requests',
    });
    try {
      classifyResponse(res);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err.retryAfterMs).toBe(0);
    }
  });

  it('throws non-retriable error on 4xx client error', () => {
    const res = new Response('', { status: 404, statusText: 'Not Found' });
    try {
      classifyResponse(res);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err.message).toBe('HTTP 404 Not Found');
      expect(err.retriable).toBe(false);
    }
  });

  it('throws retriable error on 5xx server error', () => {
    const res = new Response('', { status: 502, statusText: 'Bad Gateway' });
    try {
      classifyResponse(res);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err.message).toBe('HTTP 502 Bad Gateway');
      expect(err).not.toHaveProperty('retriable');
    }
  });
});

/* ------------------------------------------------------------------ */
/*  withRetry                                                           */
/* ------------------------------------------------------------------ */

describe('withRetry', () => {
  const instantSleep = () => Promise.resolve();

  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns fn result on first success', async () => {
    const result = await withRetry(() => Promise.resolve('ok'), {
      sleepFn: instantSleep,
    });
    expect(result).toBe('ok');
  });

  it('retries on error and succeeds on later attempt', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValueOnce('recovered');

    const result = await withRetry(fn, { retries: 2, sleepFn: instantSleep });
    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws after all retries are exhausted', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('persistent'));

    await expect(
      withRetry(fn, { retries: 1, sleepFn: instantSleep }),
    ).rejects.toThrow('persistent');
    // initial + 1 retry = 2 calls
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not retry on retriable=false', async () => {
    const err = Object.assign(new Error('client error'), { retriable: false });
    const fn = vi.fn().mockRejectedValue(err);

    await expect(
      withRetry(fn, { retries: 2, sleepFn: instantSleep }),
    ).rejects.toThrow('client error');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('calls onRetry with attempt index, error, and computed delay', async () => {
    const onRetry = vi.fn();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce('ok');

    await withRetry(fn, { retries: 2, sleepFn: instantSleep, onRetry });

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(
      0,
      expect.objectContaining({ message: 'fail' }),
      0,
    );
  });

  it('incorporates retryAfterMs into backoff delay', async () => {
    const sleepFn = vi.fn().mockResolvedValue(undefined);
    // Math.random = 0 → fullJitter(0) = 0; Math.max(0, 5000) = 5000
    const err = Object.assign(new Error('rate limited'), {
      retryAfterMs: 5000,
    });
    const fn = vi
      .fn()
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce('ok');

    await withRetry(fn, { retries: 2, sleepFn });
    expect(sleepFn).toHaveBeenCalledWith(5000);
  });

  it('throws non-retriable when retryAfterMs exceeds MAX_RETRY_AFTER_MS (#174)', async () => {
    const err = Object.assign(new Error('rate limited'), {
      retryAfterMs: MAX_RETRY_AFTER_MS + 1_000,
    });
    const fn = vi.fn().mockRejectedValue(err);

    await expect(
      withRetry(fn, { retries: 2, sleepFn: instantSleep }),
    ).rejects.toMatchObject({ message: 'rate limited', retriable: false });
    // Must not retry — first attempt triggers the cap.
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries normally when retryAfterMs equals MAX_RETRY_AFTER_MS (#174)', async () => {
    const sleepFn = vi.fn().mockResolvedValue(undefined);
    const err = Object.assign(new Error('rate limited'), {
      retryAfterMs: MAX_RETRY_AFTER_MS,
    });
    const fn = vi
      .fn()
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce('ok');

    const result = await withRetry(fn, { retries: 2, sleepFn });
    expect(result).toBe('ok');
    expect(sleepFn).toHaveBeenCalledWith(MAX_RETRY_AFTER_MS);
  });

  it('passes zero-based attempt index to fn', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    await withRetry(fn, { retries: 0, sleepFn: instantSleep });
    expect(fn).toHaveBeenCalledWith(0);
  });

  it('exports DEFAULT_RETRIES as 2', () => {
    expect(DEFAULT_RETRIES).toBe(2);
  });
});
