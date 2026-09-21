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

vi.mock('leaflet.heat', () => ({}));

vi.mock('leaflet', () => ({
  default: { heatLayer: mocks.heatLayer },
}));

/* ------------------------------------------------------------------ */
/*  Import under test (after mocks are in place)                       */
/* ------------------------------------------------------------------ */

const { createHeatLayer } = await import('./heatmapAdapter.js');

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('heatmapAdapter', () => {
  it('delegates to L.heatLayer with the given options', () => {
    const opts = { radius: 45, blur: 22 };
    createHeatLayer(opts);

    expect(mocks.heatLayer).toHaveBeenCalledWith([], opts);
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
});
