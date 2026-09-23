import { useEffect } from 'react';
import { MapContainer, TileLayer, ScaleControl, useMap, useMapEvents } from 'react-leaflet';
import { MAP, TILE_LAYERS } from '../config/index.js';
import CountyBoundaryLayer from './CountyBoundaryLayer.jsx';
import HeatmapLayer from './HeatmapLayer.jsx';
import SchoolMarkers from './SchoolMarkers.jsx';

/**
 * Keeps the Leaflet map zoom in sync with React state.
 *
 * - `zoomend` events (user scroll/pinch/button) are forwarded to the parent
 *   via `onZoomChange` so the URL query string stays current.
 * - External zoom changes (e.g. popstate navigation restoring a shared link)
 *   are applied back to the Leaflet map via `setZoom`.
 *
 * Infinite-loop guard: programmatic `setZoom` fires `zoomend`, but the
 * handler compares the new value to the current prop and only calls
 * `onZoomChange` when they differ.
 */
function MapViewSync({ zoom, onZoomChange }) {
  const map = useMap();

  useMapEvents({
    zoomend() {
      const current = map.getZoom();
      if (current !== zoom) onZoomChange(current);
    },
  });

  useEffect(() => {
    if (map.getZoom() !== zoom) map.setZoom(zoom);
  }, [zoom, map]);

  return null;
}

export default function SchoolMap({
  schools,
  year,
  layers,
  overlayData,
  zoom,
  onZoomChange,
}) {
  const activeTile =
    TILE_LAYERS.find((t) => t.id === layers.baseMap) || TILE_LAYERS[0];

  const effectiveZoom = zoom ?? MAP.zoom;

  return (
    <MapContainer
      className="map"
      center={MAP.center}
      zoom={effectiveZoom}
      minZoom={MAP.minZoom}
      maxZoom={MAP.maxZoom}
      scrollWheelZoom
      role="application"
      aria-roledescription="互動地圖"
      aria-label="全台國小廢校風險地圖，可用鍵盤方向鍵平移、加減鍵縮放"
    >
      <MapViewSync zoom={effectiveZoom} onZoomChange={onZoomChange} />
      <TileLayer
        key={activeTile.id}
        url={activeTile.url}
        attribution={activeTile.attribution}
        maxZoom={MAP.maxZoom}
        maxNativeZoom={activeTile.maxNativeZoom}
      />
      <CountyBoundaryLayer
        visible={layers.countyBoundary}
        data={overlayData?.countyBoundary}
      />
      <ScaleControl position="bottomleft" imperial={false} />
      <HeatmapLayer schools={schools} year={year} visible={layers.heatmap} />
      <SchoolMarkers schools={schools} year={year} visible={layers.markers} />
    </MapContainer>
  );
}
