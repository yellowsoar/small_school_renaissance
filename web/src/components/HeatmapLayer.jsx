import { useEffect, useMemo, useRef } from 'react';
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
  const layerRef = useRef(null);

  const points = useMemo(() => {
    const result = [];
    for (const school of schools) {
      const projected = school.projections.get(year);
      if (projected == null || projected > HEATMAP_THRESHOLD) continue;
      const intensity = Math.max(0.15, 1 - projected / HEATMAP_THRESHOLD);
      result.push([...school.position, intensity]);
    }
    return result;
  }, [schools, year]);

  // Create once, then feed it new points. Rebuilding the layer on every year
  // change makes the slider flicker as the canvas is torn down and re-added.
  useEffect(() => {
    if (!visible) return undefined;

    const layer = L.heatLayer([], HEATMAP_OPTIONS).addTo(map);
    layerRef.current = layer;

    return () => {
      layerRef.current = null;
      layer.remove();
    };
  }, [map, visible]);

  // `visible` belongs in these deps: re-showing the layer creates a fresh,
  // empty one, and only this effect puts the points back into it.
  useEffect(() => {
    layerRef.current?.setLatLngs(points);
  }, [points, visible]);

  return null;
}
