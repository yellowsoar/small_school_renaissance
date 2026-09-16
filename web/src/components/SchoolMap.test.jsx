import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import SchoolMap from './SchoolMap.jsx';
import { MAP } from '../config/index.js';

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
const layers = { heatmap: true, markers: true };

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

  it('passes tile config to TileLayer', () => {
    render(<SchoolMap schools={schools} year={year} layers={layers} />);

    expect(mocks.tileLayerProps).toHaveBeenCalledWith(
      expect.objectContaining({
        url: MAP.tileUrl,
        attribution: MAP.tileAttribution,
        maxZoom: MAP.maxZoom,
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
      <SchoolMap schools={schools} year={year} layers={{ heatmap: false, markers: false }} />,
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
