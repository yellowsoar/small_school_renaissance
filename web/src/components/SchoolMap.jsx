import { MapContainer, TileLayer, ScaleControl } from 'react-leaflet';
import { MAP } from '../config/index.js';
import HeatmapLayer from './HeatmapLayer.jsx';
import SchoolMarkers from './SchoolMarkers.jsx';

export default function SchoolMap({ schools, year, layers }) {
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
        url={MAP.tileUrl}
        attribution={MAP.tileAttribution}
        maxZoom={MAP.maxZoom}
      />
      <ScaleControl position="bottomleft" imperial={false} />
      <HeatmapLayer schools={schools} year={year} visible={layers.heatmap} />
      <SchoolMarkers schools={schools} year={year} visible={layers.markers} />
    </MapContainer>
  );
}
