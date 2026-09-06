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
      preferCanvas
      scrollWheelZoom
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
