import { describe, expect, it } from 'vitest';
import {
  DATA_URL,
  BASE_YEAR,
  REFERENCE_YEAR,
  PROJECTION_YEARS,
  MAP,
  TILE_LAYERS,
  RISK_TIERS,
  HEATMAP_THRESHOLD,
  HEATMAP_OPTIONS,
  METHODOLOGY,
  requireTier,
} from './index.js';

describe('config', () => {
  // ---------------------------------------------------------------------------
  // Year constants
  // ---------------------------------------------------------------------------

  it('BASE_YEAR and REFERENCE_YEAR are positive integers with BASE > REFERENCE', () => {
    expect(Number.isInteger(BASE_YEAR)).toBe(true);
    expect(Number.isInteger(REFERENCE_YEAR)).toBe(true);
    expect(BASE_YEAR).toBeGreaterThan(REFERENCE_YEAR);
    expect(REFERENCE_YEAR).toBeGreaterThan(0);
  });

  // ---------------------------------------------------------------------------
  // PROJECTION_YEARS
  // ---------------------------------------------------------------------------

  it('PROJECTION_YEARS is a consecutive sequence starting at BASE_YEAR + 1', () => {
    expect(PROJECTION_YEARS).toHaveLength(17);
    expect(PROJECTION_YEARS[0]).toBe(BASE_YEAR + 1);
    expect(PROJECTION_YEARS.at(-1)).toBe(130);

    for (let i = 1; i < PROJECTION_YEARS.length; i++) {
      expect(PROJECTION_YEARS[i]).toBe(PROJECTION_YEARS[i - 1] + 1);
    }
  });

  // ---------------------------------------------------------------------------
  // MAP
  // ---------------------------------------------------------------------------

  it('MAP center is within the Taiwan bounding box', () => {
    const [lat, lng] = MAP.center;
    // Rough Taiwan bounding box: lat 21.5–26.5, lng 119–123
    expect(lat).toBeGreaterThanOrEqual(21.5);
    expect(lat).toBeLessThanOrEqual(26.5);
    expect(lng).toBeGreaterThanOrEqual(119);
    expect(lng).toBeLessThanOrEqual(123);
  });

  it('MAP zoom levels are ordered: minZoom <= zoom <= maxZoom', () => {
    expect(MAP.minZoom).toBeLessThanOrEqual(MAP.zoom);
    expect(MAP.zoom).toBeLessThanOrEqual(MAP.maxZoom);
  });

  it('MAP markerZoom is between minZoom and maxZoom', () => {
    expect(MAP.markerZoom).toBeGreaterThanOrEqual(MAP.minZoom);
    expect(MAP.markerZoom).toBeLessThanOrEqual(MAP.maxZoom);
  });

  // ---------------------------------------------------------------------------
  // TILE_LAYERS
  // ---------------------------------------------------------------------------

  it('every TILE_LAYERS entry has a valid url and attribution', () => {
    expect(TILE_LAYERS.length).toBeGreaterThan(0);
    for (const layer of TILE_LAYERS) {
      expect(layer.id).toBeTruthy();
      expect(layer.label).toBeTruthy();
      expect(layer.url).toMatch(/^https?:\/\//);
      expect(layer.attribution).toBeTruthy();
    }
  });

  // ---------------------------------------------------------------------------
  // RISK_TIERS
  // ---------------------------------------------------------------------------

  it('RISK_TIERS has unique IDs', () => {
    const ids = RISK_TIERS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('RISK_TIERS max values are sorted ascending', () => {
    for (let i = 1; i < RISK_TIERS.length; i++) {
      expect(RISK_TIERS[i].max).toBeGreaterThan(RISK_TIERS[i - 1].max);
    }
  });

  it('RISK_TIERS first tier starts at 0 and last tier ends at Infinity', () => {
    expect(RISK_TIERS[0].max).toBe(0);
    expect(RISK_TIERS.at(-1).max).toBe(Infinity);
  });

  it('RISK_TIERS thresholds form contiguous buckets with no gaps', () => {
    // Each tier covers (previous.max, current.max]. Verify they are strictly
    // increasing, which guarantees every positive number falls into exactly one.
    const maxValues = RISK_TIERS.map((t) => t.max);
    for (let i = 1; i < maxValues.length; i++) {
      expect(maxValues[i]).toBeGreaterThan(maxValues[i - 1]);
    }
  });

  it('every RISK_TIER has required display properties', () => {
    for (const tier of RISK_TIERS) {
      expect(tier.id).toBeTruthy();
      expect(tier.label).toBeTruthy();
      expect(tier.shape).toBeTruthy();
      expect(tier.color).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(typeof tier.describe).toBe('function');
      expect(tier.describe()).toBeTruthy();
    }
  });

  // ---------------------------------------------------------------------------
  // requireTier (#239)
  // ---------------------------------------------------------------------------

  it('requireTier returns the correct tier for every valid id', () => {
    for (const tier of RISK_TIERS) {
      const result = requireTier(tier.id);
      expect(result).toBe(tier);
      expect(result.id).toBe(tier.id);
      expect(result.max).toBe(tier.max);
    }
  });

  it('requireTier throws a descriptive error for an unknown id', () => {
    expect(() => requireTier('nonexistent')).toThrow('RISK_TIERS 設定錯誤');
    expect(() => requireTier('nonexistent')).toThrow('nonexistent');
  });

  it('requireTier error message lists all available ids', () => {
    try {
      requireTier('bogus');
      expect.fail('should have thrown');
    } catch (error) {
      for (const tier of RISK_TIERS) {
        expect(error.message).toContain(tier.id);
      }
    }
  });

  // ---------------------------------------------------------------------------
  // HEATMAP
  // ---------------------------------------------------------------------------

  it('HEATMAP_THRESHOLD is a positive number', () => {
    expect(HEATMAP_THRESHOLD).toBeGreaterThan(0);
    expect(Number.isFinite(HEATMAP_THRESHOLD)).toBe(true);
  });

  it('HEATMAP_OPTIONS has required fields with valid values', () => {
    expect(HEATMAP_OPTIONS.radius).toBeGreaterThan(0);
    expect(HEATMAP_OPTIONS.blur).toBeGreaterThanOrEqual(0);
    expect(HEATMAP_OPTIONS.minOpacity).toBeGreaterThan(0);
    expect(HEATMAP_OPTIONS.minOpacity).toBeLessThanOrEqual(1);
    expect(HEATMAP_OPTIONS.maxZoom).toBe(MAP.markerZoom);
    expect(HEATMAP_OPTIONS.gradient).toBeTruthy();
  });

  it('HEATMAP_OPTIONS gradient keys are ascending between 0 and 1', () => {
    const keys = Object.keys(HEATMAP_OPTIONS.gradient).map(Number);
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) {
      expect(k).toBeGreaterThanOrEqual(0);
      expect(k).toBeLessThanOrEqual(1);
    }
    for (let i = 1; i < keys.length; i++) {
      expect(keys[i]).toBeGreaterThan(keys[i - 1]);
    }
  });

  // ---------------------------------------------------------------------------
  // DATA_URL & METHODOLOGY
  // ---------------------------------------------------------------------------

  it('DATA_URL ends with the expected CSV filename', () => {
    expect(DATA_URL).toMatch(/113-107\.csv$/);
  });

  it('METHODOLOGY is a non-empty string', () => {
    expect(typeof METHODOLOGY).toBe('string');
    expect(METHODOLOGY.length).toBeGreaterThan(0);
  });
});
