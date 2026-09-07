import { useEffect, useMemo, useState } from 'react';
import { useMap } from 'react-leaflet';

/**
 * Culls schools to the current viewport (padded, so panning does not reveal
 * empty edges). Without this every filtered school mounts a marker at once,
 * which is ~2,600 DOM nodes for a dataset the user can only see a few dozen of.
 *
 * Returns an empty list below `minZoom`, where the heatmap carries the view.
 */
export function useVisibleSchools(schools, minZoom, padding = 0.25) {
  const map = useMap();
  const [view, setView] = useState(() => ({
    zoom: map.getZoom(),
    bounds: map.getBounds().pad(padding),
  }));

  useEffect(() => {
    const sync = () =>
      setView({ zoom: map.getZoom(), bounds: map.getBounds().pad(padding) });

    sync();
    map.on('moveend', sync);
    return () => {
      map.off('moveend', sync);
    };
  }, [map, padding]);

  return useMemo(() => {
    if (view.zoom < minZoom) return [];
    return schools.filter((school) => view.bounds.contains(school.position));
  }, [schools, minZoom, view]);
}
