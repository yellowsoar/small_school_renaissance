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

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

const schools = [{ id: '1' }];
const year = 125;
const layers = { heatmap: true, markers: true, baseMap: 'osm' };

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('SchoolMap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes MAP config to MapContainer', () => {
    render(<SchoolMap schools={schools} year={year} layers={layers} />);

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
    render(<SchoolMap schools={schools} year={year} layers={layers} />);

    expect(mocks.mapContainerProps).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'application',
        'aria-roledescription': '互動地圖',
        'aria-label': '全台國小廢校風險地圖，可用鍵盤方向鍵平移、加減鍵縮放',
      }),
    );
  });

  it('uses the default OSM tile layer', () => {
    render(<SchoolMap schools={schools} year={year} layers={layers} />);

    const osm = TILE_LAYERS.find((t) => t.id === 'osm');
    expect(mocks.tileLayerProps).toHaveBeenCalledWith(
      expect.objectContaining({
        url: osm.url,
        attribution: osm.attribution,
        maxZoom: MAP.maxZoom,
      }),
    );
  });

  it('switches to a different tile layer when baseMap changes', () => {
    render(
      <SchoolMap
        schools={schools}
        year={year}
        layers={{ ...layers, baseMap: 'positron' }}
      />,
    );

    const positron = TILE_LAYERS.find((t) => t.id === 'positron');
    expect(mocks.tileLayerProps).toHaveBeenCalledWith(
      expect.objectContaining({
        url: positron.url,
        attribution: positron.attribution,
      }),
    );
  });

  it('falls back to the first tile layer for an unknown baseMap id', () => {
    render(
      <SchoolMap
        schools={schools}
        year={year}
        layers={{ ...layers, baseMap: 'nonexistent' }}
      />,
    );

    expect(mocks.tileLayerProps).toHaveBeenCalledWith(
      expect.objectContaining({
        url: TILE_LAYERS[0].url,
      }),
    );
  });

  it('configures ScaleControl with metric units at bottom-left', () => {
    render(<SchoolMap schools={schools} year={year} layers={layers} />);

    expect(mocks.scaleControlProps).toHaveBeenCalledWith(
      expect.objectContaining({
        position: 'bottomleft',
        imperial: false,
      }),
    );
  });

  it('forwards schools, year, and heatmap visibility to HeatmapLayer', () => {
    render(<SchoolMap schools={schools} year={year} layers={layers} />);

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
        layers={{ heatmap: false, markers: false, baseMap: 'osm' }}
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
});
