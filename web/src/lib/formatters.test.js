import { describe, expect, it } from 'vitest';
import { integer, percent } from './formatters.js';

describe('formatters', () => {
  describe('integer', () => {
    it('formats thousands with comma separators', () => {
      expect(integer.format(1234567)).toBe('1,234,567');
    });

    it('formats zero', () => {
      expect(integer.format(0)).toBe('0');
    });

    it('formats negative numbers', () => {
      expect(integer.format(-42)).toBe('-42');
    });
  });

  describe('percent', () => {
    it('formats positive ratio with + sign', () => {
      expect(percent.format(0.167)).toBe('+16.7%');
    });

    it('formats negative ratio with - sign', () => {
      expect(percent.format(-0.05)).toBe('-5%');
    });

    it('formats zero without sign', () => {
      expect(percent.format(0)).toBe('0%');
    });

    it('respects maximumFractionDigits: 1', () => {
      // 0.16666… rounds to 16.7%
      expect(percent.format(1 / 6)).toBe('+16.7%');
    });
  });
});
