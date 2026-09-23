import { GeoJSON } from 'react-leaflet';

const BOUNDARY_STYLE = {
  weight: 1.5,
  color: '#555',
  fillOpacity: 0.03,
  dashArray: '4 4',
};

/**
 * Renders county boundary GeoJSON as a semi-transparent overlay.
 * Styled to be subtle: dashed grey outlines that complement rather than
 * compete with the school markers and heatmap.
 */
export default function CountyBoundaryLayer({ visible, data }) {
  if (!visible || !data) return null;

  return <GeoJSON key="county-boundary" data={data} style={BOUNDARY_STYLE} />;
}
