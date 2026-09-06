import { Marker, Popup } from 'react-leaflet';
import { MAP } from '../config/index.js';
import { tierFor } from '../lib/schools.js';
import { iconFor } from '../lib/markerIcons.js';
import { useZoomVisibility } from '../hooks/useZoomVisibility.js';
import SchoolPopup from './SchoolPopup.jsx';

/**
 * Individual schools. Hidden while zoomed out, where 2.6k glyphs are noise
 * rather than information — the heatmap carries that zoom level instead.
 */
export default function SchoolMarkers({ schools, year, visible }) {
  const zoomedIn = useZoomVisibility(MAP.markerZoom);
  if (!visible || !zoomedIn) return null;

  return schools.map((school) => {
    const tier = tierFor(school.projections.get(year));
    if (!tier) return null;

    return (
      <Marker
        key={school.id}
        position={school.position}
        icon={iconFor(tier)}
        title={school.name}
        alt={`${school.name}（${tier.label}）`}
      >
        <Popup minWidth={260} maxWidth={320}>
          <SchoolPopup school={school} year={year} tier={tier} />
        </Popup>
      </Marker>
    );
  });
}
