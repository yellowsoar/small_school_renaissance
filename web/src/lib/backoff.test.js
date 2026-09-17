import { describe, expect, it, vi } from 'vitest';
import { fullJitter, BACKOFF_BASE_MS, BACKOFF_CAP_MS } from './backoff.js';

describe('fullJitter', () => {
  it('returns 0 when Math.random() returns 0', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(fullJitter(0)).toBe(0);
    vi.restoreAllMocks();
  });

  it('returns the full ceiling when Math.random() returns 1', () => {
    vi.spyOn(Math, 'random').mockReturnValue(1);
    // attempt 0: min(10000, 1000 * 2^0) = 1000
    expect(fullJitter(0)).toBe(1000);
    vi.restoreAllMocks();
  });

  it('scales ceiling exponentially with attempt number', () => {
    vi.spyOn(Math, 'random').mockReturnValue(1);
    expect(fullJitter(0)).toBe(1000);  // 1000 * 2^0 = 1000
    expect(fullJitter(1)).toBe(2000);  // 1000 * 2^1 = 2000
    expect(fullJitter(2)).toBe(4000);  // 1000 * 2^2 = 4000
    expect(fullJitter(3)).toBe(8000);  // 1000 * 2^3 = 8000
    vi.restoreAllMocks();
  });

  it('caps the ceiling at BACKOFF_CAP_MS', () => {
    vi.spyOn(Math, 'random').mockReturnValue(1);
    // attempt 4: 1000 * 2^4 = 16000, capped at 10000
    expect(fullJitter(4)).toBe(BACKOFF_CAP_MS);
    // attempt 10: 1000 * 2^10 = 1024000, capped at 10000
    expect(fullJitter(10)).toBe(BACKOFF_CAP_MS);
    vi.restoreAllMocks();
  });

  it('applies jitter proportionally (Math.random = 0.5)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    // attempt 0: 0.5 * min(10000, 1000) = 500
    expect(fullJitter(0)).toBe(500);
    // attempt 1: 0.5 * min(10000, 2000) = 1000
    expect(fullJitter(1)).toBe(1000);
    vi.restoreAllMocks();
  });

  it('accepts custom base and cap parameters', () => {
    vi.spyOn(Math, 'random').mockReturnValue(1);
    // base=500, cap=3000, attempt 0: min(3000, 500 * 1) = 500
    expect(fullJitter(0, 500, 3000)).toBe(500);
    // attempt 3: min(3000, 500 * 8) = 3000 (capped)
    expect(fullJitter(3, 500, 3000)).toBe(3000);
    vi.restoreAllMocks();
  });
});

describe('exported constants', () => {
  it('exports BACKOFF_BASE_MS as 1000', () => {
    expect(BACKOFF_BASE_MS).toBe(1000);
  });

  it('exports BACKOFF_CAP_MS as 10000', () => {
    expect(BACKOFF_CAP_MS).toBe(10000);
  });
});
