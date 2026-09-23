import { MapContainer, TileLayer, ScaleControl } from 'react-leaflet';
import { MAP, TILE_LAYERS } from '../config/index.js';
import CountyBoundaryLayer from './CountyBoundaryLayer.jsx';
import HeatmapLayer from './HeatmapLayer.jsx';
import SchoolMarkers from './SchoolMarkers.jsx';

export default function SchoolMap({ schools, year, layers, overlayData }) {
  const activeTile =
    TILE_LAYERS.find((t) => t.id === layers.baseMap) || TILE_LAYERS[0];

  return (
    <MapContainer
      className="map"
      center={MAP.center}
      zoom={MAP.zoom}
      minZoom={MAP.minZoom}
      maxZoom={MAP.maxZoom}
      scrollWheelZoom
      role="application"
      aria-roledescription="互動地圖"
      aria-label="全台國小廢校風險地圖，可用鍵盤方向鍵平移、加減鍵縮放"
    >
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
