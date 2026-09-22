import { describe, expect, it, vi } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

const mocks = vi.hoisted(() => {
  const mockLayer = {
    setLatLngs: vi.fn(),
    remove: vi.fn(),
  };
  mockLayer.addTo = vi.fn(() => mockLayer);
  return { heatLayer: vi.fn(() => mockLayer), mockLayer };
});

vi.mock('@linkurious/leaflet-heat', () => ({
  heatLayer: mocks.heatLayer,
}));

/* ------------------------------------------------------------------ */
/*  Import under test (after mocks are in place)                       */
/* ------------------------------------------------------------------ */

const { createHeatLayer } = await import('./heatmapAdapter.js');

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('heatmapAdapter', () => {
  it('delegates to heatLayer with an isolated copy of the given options', () => {
    const opts = { radius: 45, blur: 22, gradient: { 0.5: '#f00' } };
    createHeatLayer(opts);

    const passedOpts = mocks.heatLayer.mock.calls.at(-1)[1];
    expect(passedOpts).toEqual(opts);
    expect(passedOpts).not.toBe(opts);
    expect(passedOpts.gradient).not.toBe(opts.gradient);
  });

  it('returns an object with addTo, setLatLngs, and remove', () => {
    const layer = createHeatLayer({});

    expect(typeof layer.addTo).toBe('function');
    expect(typeof layer.setLatLngs).toBe('function');
    expect(typeof layer.remove).toBe('function');
  });

  it('addTo delegates to the underlying layer', () => {
    const layer = createHeatLayer({});
    const fakeMap = {};
    layer.addTo(fakeMap);

    expect(mocks.mockLayer.addTo).toHaveBeenCalledWith(fakeMap);
  });

  it('setLatLngs delegates to the underlying layer', () => {
    const layer = createHeatLayer({});
    const points = [[25, 121, 0.5]];
    layer.setLatLngs(points);

    expect(mocks.mockLayer.setLatLngs).toHaveBeenCalledWith(points);
  });

  it('remove delegates to the underlying layer', () => {
    const layer = createHeatLayer({});
    layer.remove();

    expect(mocks.mockLayer.remove).toHaveBeenCalled();
  });

  it('prevents plugin mutation from polluting the original options', () => {
    const opts = { radius: 45, gradient: { 0.2: '#ffd166', 0.5: '#f07300' } };
    createHeatLayer(opts);

    // Simulate plugin mutating the passed gradient object
    const passedOpts = mocks.heatLayer.mock.calls.at(-1)[1];
    passedOpts.gradient[0.85] = '#d7263d';
    passedOpts.radius = 99;

    expect(opts.gradient).not.toHaveProperty('0.85');
    expect(opts.radius).toBe(45);
  });
});
