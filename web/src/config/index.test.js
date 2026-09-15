import { describe, expect, it } from 'vitest';
import {
  BASE_YEAR,
  REFERENCE_YEAR,
  PROJECTION_YEARS,
  MAP,
  RISK_TIERS,
  HEATMAP_THRESHOLD,
  HEATMAP_OPTIONS,
  METHODOLOGY,
  DATA_URL,
} from './index.js';

describe('config', () => {
  describe('PROJECTION_YEARS', () => {
    it('contains 17 years (114-130)', () => {
      expect(PROJECTION_YEARS).toHaveLength(17);
      expect(PROJECTION_YEARS[0]).toBe(114);
      expect(PROJECTION_YEARS[16]).toBe(130);
    });

    it('is a contiguous sequence', () => {
      for (let i = 1; i < PROJECTION_YEARS.length; i++) {
        expect(PROJECTION_YEARS[i]).toBe(PROJECTION_YEARS[i - 1] + 1);
      }
    });
  });

  describe('BASE_YEAR / REFERENCE_YEAR', () => {
    it('BASE_YEAR is 113', () => {
      expect(BASE_YEAR).toBe(113);
    });

    it('REFERENCE_YEAR is 107', () => {
      expect(REFERENCE_YEAR).toBe(107);
    });

    it('BASE_YEAR is more recent than REFERENCE_YEAR', () => {
      expect(BASE_YEAR).toBeGreaterThan(REFERENCE_YEAR);
    });
  });

  describe('RISK_TIERS', () => {
    it('has 5 tiers', () => {
      expect(RISK_TIERS).toHaveLength(5);
    });

    it('is ordered from most to least severe (ascending max)', () => {
      for (let i = 1; i < RISK_TIERS.length; i++) {
        expect(RISK_TIERS[i].max).toBeGreaterThan(RISK_TIERS[i - 1].max);
      }
    });

    it('last tier closes with Infinity', () => {
      expect(RISK_TIERS.at(-1).max).toBe(Infinity);
    });

    it('every tier has id, label, shape, color, max, and describe()', () => {
      for (const tier of RISK_TIERS) {
        expect(tier.id).toEqual(expect.any(String));
        expect(tier.label).toEqual(expect.any(String));
        expect(tier.shape).toEqual(expect.any(String));
        expect(tier.color).toMatch(/^#/);
        expect(tier.max).toEqual(expect.any(Number));
        expect(tier.describe()).toEqual(expect.any(String));
      }
    });

    it('has unique ids', () => {
      const ids = RISK_TIERS.map((t) => t.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe('MAP', () => {
    it('center is within Taiwan bounding box', () => {
      const [lat, lng] = MAP.center;
      expect(lat).toBeGreaterThan(21);
      expect(lat).toBeLessThan(26);
      expect(lng).toBeGreaterThan(119);
      expect(lng).toBeLessThan(123);
    });

    it('minZoom < zoom < maxZoom', () => {
      expect(MAP.minZoom).toBeLessThan(MAP.zoom);
      expect(MAP.zoom).toBeLessThan(MAP.maxZoom);
    });

    it('markerZoom is within zoom range', () => {
      expect(MAP.markerZoom).toBeGreaterThanOrEqual(MAP.minZoom);
      expect(MAP.markerZoom).toBeLessThanOrEqual(MAP.maxZoom);
    });
  });

  describe('HEATMAP', () => {
    it('threshold is a positive number', () => {
      expect(HEATMAP_THRESHOLD).toBeGreaterThan(0);
    });

    it('options include radius, blur, and gradient', () => {
      expect(HEATMAP_OPTIONS.radius).toEqual(expect.any(Number));
      expect(HEATMAP_OPTIONS.blur).toEqual(expect.any(Number));
      expect(HEATMAP_OPTIONS.gradient).toEqual(expect.any(Object));
    });
  });

  describe('METHODOLOGY', () => {
    it('is a non-empty string', () => {
      expect(METHODOLOGY.length).toBeGreaterThan(0);
    });

    it('mentions the two reference years', () => {
      expect(METHODOLOGY).toMatch(/113/);
      expect(METHODOLOGY).toMatch(/107/);
    });
  });

  describe('DATA_URL', () => {
    it('ends with the expected CSV filename', () => {
      expect(DATA_URL).toMatch(/113-107\.csv$/);
    });
  });
});
