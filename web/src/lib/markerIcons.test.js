import { describe, expect, it, beforeEach } from 'vitest';
import { GLYPH_SIZE } from './shapes.js';
import { HIT_SIZE, iconFor } from './markerIcons.js';
import { RISK_TIERS, UNPROJECTED_MARKER } from '../config/index.js';

describe('HIT_SIZE geometry (#347)', () => {
  it('is larger than GLYPH_SIZE', () => {
    expect(HIT_SIZE).toBeGreaterThan(GLYPH_SIZE);
  });

  it('yields approximately 80% area increase over GLYPH_SIZE', () => {
    const oldArea = GLYPH_SIZE * GLYPH_SIZE;
    const newArea = HIT_SIZE * HIT_SIZE;
    const increase = (newArea - oldArea) / oldArea;
    // Allow 70–90% to accommodate integer rounding
    expect(increase).toBeGreaterThanOrEqual(0.7);
    expect(increase).toBeLessThanOrEqual(0.9);
  });
});

describe('iconFor', () => {
  beforeEach(() => {
    // Clear the internal icon cache between tests by importing a fresh
    // module. Since vitest caches modules, we verify via repeated calls.
  });

  it('returns a Leaflet DivIcon with HIT_SIZE dimensions', () => {
    const tier = RISK_TIERS[0];
    const icon = iconFor(tier);
    const opts = icon.options;

    expect(opts.iconSize).toEqual([HIT_SIZE, HIT_SIZE]);
  });

  it('centers the icon anchor at HIT_SIZE / 2', () => {
    const tier = RISK_TIERS[0];
    const icon = iconFor(tier);
    const opts = icon.options;
    const half = HIT_SIZE / 2;

    expect(opts.iconAnchor).toEqual([half, half]);
  });

  it('anchors popup to the visual glyph top, not the hit area edge', () => {
    const tier = RISK_TIERS[0];
    const icon = iconFor(tier);
    const opts = icon.options;
    const glyphHalf = GLYPH_SIZE / 2;

    // popupAnchor y should be -GLYPH_SIZE/2, not -HIT_SIZE/2
    expect(opts.popupAnchor).toEqual([0, -glyphHalf]);
  });

  it('uses the school-marker CSS class', () => {
    const tier = RISK_TIERS[0];
    const icon = iconFor(tier);

    expect(icon.options.className).toBe('school-marker');
  });

  it('generates an SVG with GLYPH_SIZE (not HIT_SIZE) dimensions', () => {
    const tier = RISK_TIERS[0];
    const icon = iconFor(tier);
    const html = icon.options.html;

    expect(html).toContain(`width="${GLYPH_SIZE}"`);
    expect(html).toContain(`height="${GLYPH_SIZE}"`);
    expect(html).not.toContain(`width="${HIT_SIZE}"`);
  });

  it('caches icons by tier id (same reference on repeated calls)', () => {
    const tier = RISK_TIERS[1];
    const first = iconFor(tier);
    const second = iconFor(tier);

    expect(first).toBe(second);
  });

  it('creates distinct icons for different tiers', () => {
    const iconA = iconFor(RISK_TIERS[0]);
    const iconB = iconFor(RISK_TIERS[1]);

    expect(iconA).not.toBe(iconB);
  });

  it('works for the UNPROJECTED_MARKER definition', () => {
    const icon = iconFor(UNPROJECTED_MARKER);
    const opts = icon.options;

    expect(opts.iconSize).toEqual([HIT_SIZE, HIT_SIZE]);
    expect(opts.html).toContain(`fill="${UNPROJECTED_MARKER.color}"`);
  });
});
