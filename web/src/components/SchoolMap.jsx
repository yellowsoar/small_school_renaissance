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

export default function SchoolMap({ schools, year, layers, overlayData, zoom, onZoomChange }) {
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
      aria-roledescription="\u4e92\u52d5\u5730\u5716"
      aria-label="\u5168\u53f0\u570b\u5c0f\u5ee2\u6821\u98a8\u96aa\u5730\u5716\uff0c\u53ef\u7528\u9375\u76e4\u65b9\u5411\u9375\u5e73\u79fb\u3001\u52a0\u6e1b\u9375\u7e2e\u653e"
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
