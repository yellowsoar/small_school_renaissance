import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import CountyBoundaryLayer from './CountyBoundaryLayer.jsx';

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

const mocks = vi.hoisted(() => ({
  geoJsonProps: vi.fn(),
}));

vi.mock('react-leaflet', () => ({
  GeoJSON: (props) => {
    mocks.geoJsonProps(props);
    return <div data-testid="geojson-layer" />;
  },
}));

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

const MOCK_DATA = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [121, 24],
            [122, 24],
            [122, 25],
            [121, 25],
            [121, 24],
          ],
        ],
      },
      properties: { COUNTYNAME: '\u81fa\u5317\u5e02' },
    },
  ],
};

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('CountyBoundaryLayer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders GeoJSON when visible and data is provided', () => {
    const { getByTestId } = render(
      <CountyBoundaryLayer visible={true} data={MOCK_DATA} />,
    );

    expect(getByTestId('geojson-layer')).toBeTruthy();
    expect(mocks.geoJsonProps).toHaveBeenCalledWith(
      expect.objectContaining({
        data: MOCK_DATA,
        style: expect.objectContaining({
          weight: 1.5,
          color: '#555',
          fillOpacity: 0.03,
          dashArray: '4 4',
        }),
      }),
    );
  });

  it('returns null when not visible', () => {
    const { container } = render(
      <CountyBoundaryLayer visible={false} data={MOCK_DATA} />,
    );

    expect(container.innerHTML).toBe('');
  });

  it('returns null when data is null', () => {
    const { container } = render(
      <CountyBoundaryLayer visible={true} data={null} />,
    );

    expect(container.innerHTML).toBe('');
  });

  it('returns null when both visible is false and data is null', () => {
    const { container } = render(
      <CountyBoundaryLayer visible={false} data={null} />,
    );

    expect(container.innerHTML).toBe('');
  });
});
