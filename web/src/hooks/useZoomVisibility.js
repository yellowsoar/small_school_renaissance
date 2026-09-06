import { useEffect, useState } from 'react';
import { useMap } from 'react-leaflet';

/** True while the map is zoomed in at least as far as `threshold`. */
export function useZoomVisibility(threshold) {
  const map = useMap();
  const [visible, setVisible] = useState(() => map.getZoom() >= threshold);

  useEffect(() => {
    const sync = () => setVisible(map.getZoom() >= threshold);
    sync();
    map.on('zoomend', sync);
    return () => {
      map.off('zoomend', sync);
    };
  }, [map, threshold]);

  return visible;
}
