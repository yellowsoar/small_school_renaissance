import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.heat';
import { HEATMAP_OPTIONS, HEATMAP_THRESHOLD } from '../config/index.js';

/**
 * Density of small schools. Intensity is inverted: the fewer the students,
 * the hotter the point, so the map reads as "where the risk is clustered".
 */
export default function HeatmapLayer({ schools, year, visible }) {
  const map = useMap();

  useEffect(() => {
    if (!visible) return undefined;

    const points = [];
    for (const school of schools) {
      const projected = school.projections.get(year);
      if (projected == null || projected > HEATMAP_THRESHOLD) continue;
      const intensity = Math.max(0.15, 1 - projected / HEATMAP_THRESHOLD);
      points.push([...school.position, intensity]);
    }

    const layer = L.heatLayer(points, HEATMAP_OPTIONS).addTo(map);
    return () => {
      layer.remove();
    };
  }, [map, schools, year, visible]);

  return null;
}
