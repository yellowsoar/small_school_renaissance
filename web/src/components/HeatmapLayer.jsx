import { useEffect, useMemo, useState } from 'react';
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
  const [layer, setLayer] = useState(null);

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

  // Create the layer once per toggle, empty. Holding it in state rather than a
  // ref is what lets the effect below depend on the actual instance, so a
  // re-shown layer gets repopulated without lying about its dependencies.
  useEffect(() => {
    if (!visible) return undefined;

    const heat = L.heatLayer([], HEATMAP_OPTIONS).addTo(map);
    setLayer(heat);

    return () => {
      setLayer(null);
      heat.remove();
    };
  }, [map, visible]);

  // Feed points in separately: rebuilding the layer on every year change tears
  // down and re-adds the canvas, which makes the slider flicker.
  useEffect(() => {
    layer?.setLatLngs(points);
  }, [layer, points]);

  return null;
}
