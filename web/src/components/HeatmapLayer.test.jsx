import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import HeatmapLayer from './HeatmapLayer.jsx';
import { HEATMAP_OPTIONS } from '../config/index.js';

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

const mocks = vi.hoisted(() => {
  const mockLayer = {
    setLatLngs: vi.fn(),
    remove: vi.fn(),
  };
  mockLayer.addTo = vi.fn(() => mockLayer);
  return {
    heatLayer: vi.fn(() => mockLayer),
    mockLayer,
    mockMap: {},
  };
});

vi.mock('leaflet.heat', () => ({}));

vi.mock('leaflet', () => ({
  default: { heatLayer: mocks.heatLayer },
}));

vi.mock('react-leaflet', () => ({
  useMap: () => mocks.mockMap,
}));

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('HeatmapLayer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a heat layer and adds it to the map when visible', () => {
    render(<HeatmapLayer schools={[]} year={120} visible={true} />);

    expect(mocks.heatLayer).toHaveBeenCalledWith([], HEATMAP_OPTIONS);
    expect(mocks.mockLayer.addTo).toHaveBeenCalledWith(mocks.mockMap);
  });

  it('does not create a heat layer when not visible', () => {
    render(<HeatmapLayer schools={[]} year={120} visible={false} />);

    expect(mocks.heatLayer).not.toHaveBeenCalled();
  });

  it('removes the layer when visibility changes to false', () => {
    const { rerender } = render(
      <HeatmapLayer schools={[]} year={120} visible={true} />,
    );

    rerender(<HeatmapLayer schools={[]} year={120} visible={false} />);

    expect(mocks.mockLayer.remove).toHaveBeenCalled();
  });

  it('excludes schools with projected headcount above the threshold', () => {
    const schools = [
      { position: [25, 121], projections: new Map([[120, 50]]) },
      { position: [24, 120], projections: new Map([[120, 150]]) },
    ];

    render(<HeatmapLayer schools={schools} year={120} visible={true} />);

    const calls = mocks.mockLayer.setLatLngs.mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(1);
    const points = calls[calls.length - 1][0];
    expect(points).toHaveLength(1);
    expect(points[0][0]).toBe(25);
    expect(points[0][1]).toBe(121);
  });

  it('excludes schools with null projected headcount', () => {
    const schools = [
      { position: [25, 121], projections: new Map([[120, 50]]) },
      { position: [24, 120], projections: new Map([[120, null]]) },
    ];

    render(<HeatmapLayer schools={schools} year={120} visible={true} />);

    const calls = mocks.mockLayer.setLatLngs.mock.calls;
    const points = calls[calls.length - 1][0];
    expect(points).toHaveLength(1);
  });

  it('clamps negative projected values to zero for intensity', () => {
    const schools = [
      { position: [22, 118], projections: new Map([[120, -10]]) },
    ];

    render(<HeatmapLayer schools={schools} year={120} visible={true} />);

    const calls = mocks.mockLayer.setLatLngs.mock.calls;
    const points = calls[calls.length - 1][0];
    expect(points).toHaveLength(1);
    // clamped = max(0, -10) = 0, intensity = max(0.15, 1 - 0/100) = 1
    expect(points[0][2]).toBe(1);
  });

  it('applies intensity floor of 0.15', () => {
    const schools = [
      { position: [25, 121], projections: new Map([[120, 99]]) },
    ];

    render(<HeatmapLayer schools={schools} year={120} visible={true} />);

    const calls = mocks.mockLayer.setLatLngs.mock.calls;
    const points = calls[calls.length - 1][0];
    // clamped = 99, intensity = max(0.15, 1 - 99/100) = max(0.15, 0.01) = 0.15
    expect(points[0][2]).toBeCloseTo(0.15, 2);
  });

  it('updates points when year changes', () => {
    const schools = [
      { position: [25, 121], projections: new Map([[120, 50], [121, 30]]) },
    ];

    const { rerender } = render(
      <HeatmapLayer schools={schools} year={120} visible={true} />,
    );

    // year=120: projected=50, intensity = max(0.15, 1 - 50/100) = 0.5
    let calls = mocks.mockLayer.setLatLngs.mock.calls;
    expect(calls[calls.length - 1][0][0][2]).toBeCloseTo(0.5);

    vi.clearAllMocks();
    rerender(<HeatmapLayer schools={schools} year={121} visible={true} />);

    // year=121: projected=30, intensity = max(0.15, 1 - 30/100) = 0.7
    calls = mocks.mockLayer.setLatLngs.mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[calls.length - 1][0][0][2]).toBeCloseTo(0.7);
  });
});
