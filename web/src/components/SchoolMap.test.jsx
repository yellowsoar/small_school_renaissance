import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import SchoolMap from './SchoolMap.jsx';
import { MAP, TILE_LAYERS } from '../config/index.js';

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

const mocks = vi.hoisted(() => ({
  mapContainerProps: vi.fn(),
  tileLayerProps: vi.fn(),
  scaleControlProps: vi.fn(),
  heatmapProps: vi.fn(),
  markersProps: vi.fn(),
  boundaryProps: vi.fn(),
  mapViewSyncProps: vi.fn(),
}));

// Track the last useMap/useMapEvents calls for MapViewSync verification
const leafletMocks = vi.hoisted(() => ({
  useMap: vi.fn(() => ({ getZoom: () => 7, setZoom: vi.fn(), fitBounds: vi.fn() })),
  useMapEvents: vi.fn(() => null),
}));

const leafletCoreMocks = vi.hoisted(() => ({
  latLngBounds: vi.fn(() => 'mock-bounds'),
}));

vi.mock('react-leaflet', () => ({
  MapContainer: (props) => {
    mocks.mapContainerProps(props);
    return <div data-testid="map-container">{props.children}</div>;
  },
  TileLayer: (props) => {
    mocks.tileLayerProps(props);
    return <div data-testid="tile-layer" />;
  },
  ScaleControl: (props) => {
    mocks.scaleControlProps(props);
    return <div data-testid="scale-control" />;
  },
  useMap: (...args) => leafletMocks.useMap(...args),
  useMapEvents: (...args) => leafletMocks.useMapEvents(...args),
}));

vi.mock('leaflet', () => ({
  latLngBounds: (...args) => leafletCoreMocks.latLngBounds(...args),
}));

vi.mock('./HeatmapLayer.jsx', () => ({
  default: (props) => {
    mocks.heatmapProps(props);
    return <div data-testid="heatmap-layer" />;
  },
}));

vi.mock('./SchoolMarkers.jsx', () => ({
  default: (props) => {
    mocks.markersProps(props);
    return <div data-testid="school-markers" />;
  },
}));

vi.mock('./CountyBoundaryLayer.jsx', () => ({
  default: (props) => {
    mocks.boundaryProps(props);
    return <div data-testid="county-boundary-layer" />;
  },
}));

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

const schools = [{ id: '1' }];
const year = 125;
const layers = { heatmap: true, markers: true, baseMap: 'osm', countyBoundary: true };
const overlayData = {
  countyBoundary: { type: 'FeatureCollection', features: [] },
};
const noop = () => {};

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('SchoolMap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    leafletMocks.useMap.mockReturnValue({ getZoom: () => 7, setZoom: vi.fn(), fitBounds: vi.fn() });
  });

  it('passes MAP config to MapContainer', () => {
    render(<SchoolMap schools={schools} year={year} layers={layers} overlayData={overlayData} />);

    expect(mocks.mapContainerProps).toHaveBeenCalledWith(
      expect.objectContaining({
        center: MAP.center,
        zoom: MAP.zoom,
        minZoom: MAP.minZoom,
        maxZoom: MAP.maxZoom,
        scrollWheelZoom: true,
      }),
    );
  });

  it('passes a11y attributes to MapContainer', () => {
    render(<SchoolMap schools={schools} year={year} layers={layers} overlayData={overlayData} />);

    expect(mocks.mapContainerProps).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'application',
        'aria-roledescription': '\u4e92\u52d5\u5730\u5716',
        'aria-label': '\u5168\u53f0\u570b\u5c0f\u5ee2\u6821\u98a8\u96aa\u5730\u5716\uff0c\u53ef\u7528\u9375\u76e4\u65b9\u5411\u9375\u5e73\u79fb\u3001\u52a0\u6e1b\u9375\u7e2e\u653e',
      }),
    );
  });

  it('uses the default OSM tile layer', () => {
    render(<SchoolMap schools={schools} year={year} layers={layers} overlayData={overlayData} />);

    const osm = TILE_LAYERS.find((t) => t.id === 'osm');
    expect(mocks.tileLayerProps).toHaveBeenCalledWith(
      expect.objectContaining({
        url: osm.url,
        attribution: osm.attribution,
        maxZoom: MAP.maxZoom,
      }),
    );
  });

  it('switches to HOT tile layer when baseMap changes', () => {
    render(
      <SchoolMap
        schools={schools}
        year={year}
        layers={{ ...layers, baseMap: 'hot' }}
        overlayData={overlayData}
      />,
    );

    const hot = TILE_LAYERS.find((t) => t.id === 'hot');
    expect(mocks.tileLayerProps).toHaveBeenCalledWith(
      expect.objectContaining({
        url: hot.url,
        attribution: hot.attribution,
      }),
    );
  });

  it('forwards maxNativeZoom for topo tile layer', () => {
    render(
      <SchoolMap
        schools={schools}
        year={year}
        layers={{ ...layers, baseMap: 'topo' }}
        overlayData={overlayData}
      />,
    );

    const topo = TILE_LAYERS.find((t) => t.id === 'topo');
    expect(mocks.tileLayerProps).toHaveBeenCalledWith(
      expect.objectContaining({
        url: topo.url,
        maxNativeZoom: 17,
      }),
    );
  });

  it('falls back to the first tile layer for an unknown baseMap id', () => {
    render(
      <SchoolMap
        schools={schools}
        year={year}
        layers={{ ...layers, baseMap: 'nonexistent' }}
        overlayData={overlayData}
      />,
    );

    expect(mocks.tileLayerProps).toHaveBeenCalledWith(
      expect.objectContaining({
        url: TILE_LAYERS[0].url,
      }),
    );
  });

  it('configures ScaleControl with metric units at bottom-left', () => {
    render(<SchoolMap schools={schools} year={year} layers={layers} overlayData={overlayData} />);

    expect(mocks.scaleControlProps).toHaveBeenCalledWith(
      expect.objectContaining({
        position: 'bottomleft',
        imperial: false,
      }),
    );
  });

  it('forwards schools, year, and heatmap visibility to HeatmapLayer', () => {
    render(<SchoolMap schools={schools} year={year} layers={layers} overlayData={overlayData} />);

    expect(mocks.heatmapProps).toHaveBeenCalledWith(
      expect.objectContaining({
        schools,
        year,
        visible: true,
      }),
    );
  });

  it('forwards schools, year, and markers visibility to SchoolMarkers', () => {
    render(
      <SchoolMap
        schools={schools}
        year={year}
        layers={{ heatmap: false, markers: false, baseMap: 'osm', countyBoundary: true }}
        overlayData={overlayData}
      />,
    );

    expect(mocks.markersProps).toHaveBeenCalledWith(
      expect.objectContaining({
        schools,
        year,
        visible: false,
      }),
    );
  });

  it('forwards overlay data and visibility to CountyBoundaryLayer', () => {
    render(<SchoolMap schools={schools} year={year} layers={layers} overlayData={overlayData} />);

    expect(mocks.boundaryProps).toHaveBeenCalledWith(
      expect.objectContaining({
        visible: true,
        data: overlayData.countyBoundary,
      }),
    );
  });

  it('passes countyBoundary visibility as false when layer is disabled', () => {
    render(
      <SchoolMap
        schools={schools}
        year={year}
        layers={{ ...layers, countyBoundary: false }}
        overlayData={overlayData}
      />,
    );

    expect(mocks.boundaryProps).toHaveBeenCalledWith(
      expect.objectContaining({
        visible: false,
      }),
    );
  });

  it('handles missing overlayData gracefully', () => {
    render(<SchoolMap schools={schools} year={year} layers={layers} />);

    expect(mocks.boundaryProps).toHaveBeenCalledWith(
      expect.objectContaining({
        visible: true,
        data: undefined,
      }),
    );
  });

  it('passes zoom prop to MapContainer (#348)', () => {
    render(
      <SchoolMap
        schools={schools}
        year={year}
        layers={layers}
        overlayData={overlayData}
        zoom={14}
        onZoomChange={noop}
      />,
    );

    expect(mocks.mapContainerProps).toHaveBeenCalledWith(
      expect.objectContaining({
        zoom: 14,
      }),
    );
  });

  it('defaults to MAP.zoom when zoom prop is undefined (#348)', () => {
    render(
      <SchoolMap
        schools={schools}
        year={year}
        layers={layers}
        overlayData={overlayData}
      />,
    );

    expect(mocks.mapContainerProps).toHaveBeenCalledWith(
      expect.objectContaining({
        zoom: MAP.zoom,
      }),
    );
  });

  it('registers useMapEvents for zoomend in MapViewSync (#348)', () => {
    render(
      <SchoolMap
        schools={schools}
        year={year}
        layers={layers}
        overlayData={overlayData}
        zoom={10}
        onZoomChange={noop}
      />,
    );

    expect(leafletMocks.useMapEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        zoomend: expect.any(Function),
      }),
    );
  });

  it('calls onZoomChange when zoomend fires with a different zoom (#348)', () => {
    const onZoomChange = vi.fn();
    leafletMocks.useMap.mockReturnValue({ getZoom: () => 12, setZoom: vi.fn(), fitBounds: vi.fn() });

    render(
      <SchoolMap
        schools={schools}
        year={year}
        layers={layers}
        overlayData={overlayData}
        zoom={10}
        onZoomChange={onZoomChange}
      />,
    );

    // Simulate zoomend event
    const zoomendHandler = leafletMocks.useMapEvents.mock.calls[0][0].zoomend;
    zoomendHandler();

    expect(onZoomChange).toHaveBeenCalledWith(12);
  });

  it('does not call onZoomChange when zoomend fires with the same zoom (#348)', () => {
    const onZoomChange = vi.fn();
    leafletMocks.useMap.mockReturnValue({ getZoom: () => 10, setZoom: vi.fn(), fitBounds: vi.fn() });

    render(
      <SchoolMap
        schools={schools}
        year={year}
        layers={layers}
        overlayData={overlayData}
        zoom={10}
        onZoomChange={onZoomChange}
      />,
    );

    const zoomendHandler = leafletMocks.useMapEvents.mock.calls[0][0].zoomend;
    zoomendHandler();

    expect(onZoomChange).not.toHaveBeenCalled();
  });
});

describe('FitBoundsOnSearch (#373)', () => {
  let fitBoundsFn;

  beforeEach(() => {
    vi.clearAllMocks();
    fitBoundsFn = vi.fn();
    leafletMocks.useMap.mockReturnValue({
      getZoom: () => 7,
      setZoom: vi.fn(),
      fitBounds: fitBoundsFn,
    });
    leafletCoreMocks.latLngBounds.mockReturnValue('mock-bounds');
  });

  it('does not fitBounds when search is empty (#373)', () => {
    vi.useFakeTimers();
    render(
      <SchoolMap
        schools={schools}
        year={year}
        layers={layers}
        overlayData={overlayData}
        search=""
      />,
    );
    vi.advanceTimersByTime(1000);
    expect(fitBoundsFn).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('calls map.fitBounds 500ms after search changes (#373)', () => {
    vi.useFakeTimers();
    const schoolsWithPos = [
      { id: '1', position: [23.0, 120.0] },
      { id: '2', position: [24.0, 121.0] },
    ];
    const { rerender } = render(
      <SchoolMap
        schools={schoolsWithPos}
        year={year}
        layers={layers}
        overlayData={overlayData}
        search=""
      />,
    );

    rerender(
      <SchoolMap
        schools={schoolsWithPos}
        year={year}
        layers={layers}
        overlayData={overlayData}
        search="\u53f0\u5317"
      />,
    );

    expect(fitBoundsFn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(fitBoundsFn).toHaveBeenCalledOnce();
    expect(fitBoundsFn).toHaveBeenCalledWith('mock-bounds', {
      maxZoom: 15,
      padding: [50, 50],
    });
    vi.useRealTimers();
  });

  it('debounces rapid search changes, only calling fitBounds once (#373)', () => {
    vi.useFakeTimers();
    const schoolsWithPos = [{ id: '1', position: [23.0, 120.0] }];
    const { rerender } = render(
      <SchoolMap
        schools={schoolsWithPos}
        year={year}
        layers={layers}
        overlayData={overlayData}
        search=""
      />,
    );

    rerender(
      <SchoolMap schools={schoolsWithPos} year={year} layers={layers} overlayData={overlayData} search="\u53f0" />,
    );
    vi.advanceTimersByTime(200);

    rerender(
      <SchoolMap schools={schoolsWithPos} year={year} layers={layers} overlayData={overlayData} search="\u53f0\u5317" />,
    );
    vi.advanceTimersByTime(200);

    rerender(
      <SchoolMap schools={schoolsWithPos} year={year} layers={layers} overlayData={overlayData} search="\u53f0\u5317\u5e02" />,
    );
    vi.advanceTimersByTime(500);

    expect(fitBoundsFn).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it('does not fitBounds when schools array is empty (#373)', () => {
    vi.useFakeTimers();
    const { rerender } = render(
      <SchoolMap
        schools={[]}
        year={year}
        layers={layers}
        overlayData={overlayData}
        search=""
      />,
    );

    rerender(
      <SchoolMap schools={[]} year={year} layers={layers} overlayData={overlayData} search="\u53f0\u5317" />,
    );

    vi.advanceTimersByTime(500);
    expect(fitBoundsFn).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('passes maxZoom and padding options to fitBounds (#373)', () => {
    vi.useFakeTimers();
    const schoolsWithPos = [{ id: '1', position: [23.5, 120.5] }];
    const { rerender } = render(
      <SchoolMap
        schools={schoolsWithPos}
        year={year}
        layers={layers}
        overlayData={overlayData}
        search=""
      />,
    );

    rerender(
      <SchoolMap
        schools={schoolsWithPos}
        year={year}
        layers={layers}
        overlayData={overlayData}
        search="test"
      />,
    );

    vi.advanceTimersByTime(500);
    expect(leafletCoreMocks.latLngBounds).toHaveBeenCalledWith([[23.5, 120.5]]);
    expect(fitBoundsFn).toHaveBeenCalledWith('mock-bounds', {
      maxZoom: 15,
      padding: [50, 50],
    });
    vi.useRealTimers();
  });
});
